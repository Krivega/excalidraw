/* eslint-disable no-console */
// Inspired and partly copied from https://gitlab.com/kiliandeca/excalidraw-fork
// MIT, Kilian Decaderincourt

import type { Socket as ISocketIO } from "socket.io-client";
import { getSyncableElements, SyncableExcalidrawElement } from ".";
import { MIME_TYPES } from "../../packages/excalidraw/constants";
import { decompressData } from "../../packages/excalidraw/data/encode";
import {
  decryptData,
  encryptData,
  IV_LENGTH_BYTES,
} from "../../packages/excalidraw/data/encryption";
import type { RemoteExcalidrawElement } from "../../packages/excalidraw/data/reconcile";
import { reconcileElements } from "../../packages/excalidraw/data/reconcile";
import { restoreElements } from "../../packages/excalidraw/data/restore";
import { getSceneVersion } from "../../packages/excalidraw/element";
import {
  ExcalidrawElement,
  FileId,
} from "../../packages/excalidraw/element/types";
import {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "../../packages/excalidraw/types";
import Portal from "../collab/Portal";
import getHeaders from "./getHeaders";
import { StoredScene } from "./StorageBackend";

const SCENE_VERSION_LENGTH_BYTES = 4;

// There is a lot of intentional duplication with the firebase file
// to prevent modifying upstream files and ease futur maintenance of this fork

const httpStorageSceneVersionCache = new WeakMap<ISocketIO, number>();

export const isSavedToHttpStorage = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);
    const sceneVersionCache = httpStorageSceneVersionCache.get(portal.socket);
    return sceneVersionCache === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveToHttpStorage = async ({
  portal,
  appState,
  elements,
  HTTP_STORAGE_BACKEND_URL,
  token,
}: {
  portal: Portal;
  appState: AppState;
  elements: readonly SyncableExcalidrawElement[];
  HTTP_STORAGE_BACKEND_URL: string;
  token?: string;
}): Promise<SyncableExcalidrawElement[] | null> => {
  const { roomId, roomKey, socket } = portal;
  const syncableElements = getSyncableElements(restoreElements(elements, null));

  const sceneVersion = getSceneVersion(elements);
  const sceneVersionSyncable = getSceneVersion(syncableElements);
  const isSaved = isSavedToHttpStorage(portal, elements);
  if (
    // if no room exists, consider the room saved because there's nothing we can
    // do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSaved
  ) {
    return null;
  }

  const headers = getHeaders({ token });
  const getResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
    { headers },
  );
  if (!getResponse.ok && getResponse.status !== 404) {
    return null;
  }
  if (getResponse.status === 404) {
    const result: boolean = await saveElementsToBackend({
      roomKey,
      roomId,
      elements: [...elements],
      sceneVersion,
      HTTP_STORAGE_BACKEND_URL,
      token,
    });
    if (result) {
      return [];
    }
    return null;
  }
  // If room already exist, we compare scene versions to check
  // if we're up to date before saving our scene
  const buffer = await getResponse.arrayBuffer();

  const existingElements = await getElementsFromBuffer(buffer, roomKey);

  const elementsFromRequest = getSyncableElements(
    restoreElements(existingElements, null),
  );
  const sceneVersionFromRequest = getSceneVersion(elementsFromRequest);
  if (sceneVersionFromRequest >= sceneVersion) {
    return null;
  }

  const reconciledElements = getSyncableElements(
    reconcileElements(elements, existingElements, appState),
  );

  // const reconciledElements = elementsFromRequest
  const result: boolean = await saveElementsToBackend({
    roomKey,
    roomId,
    elements: reconciledElements,
    sceneVersion,
    HTTP_STORAGE_BACKEND_URL,
    token,
  });
  if (result) {
    httpStorageSceneVersionCache.set(socket, sceneVersion);

    return reconciledElements;
  }

  return null;
};

export const loadFromHttpStorage = async ({
  roomId,
  roomKey,
  socket,
  HTTP_STORAGE_BACKEND_URL,
  token,
}: {
  roomId: string;
  roomKey: string;
  socket: ISocketIO | null;
  HTTP_STORAGE_BACKEND_URL: string;
  token?: string;
}): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const headers = getHeaders({ token });
  const getResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
    { headers },
  );
  const buffer = await getResponse.arrayBuffer();
  const elementsFromBuffer = await getElementsFromBuffer(buffer, roomKey);
  const elements = getSyncableElements(
    restoreElements(elementsFromBuffer, null),
  );
  const sceneVersion = getSceneVersion(elements);
  if (socket) {
    httpStorageSceneVersionCache.set(socket, sceneVersion);
  }

  return elements;
};

const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly RemoteExcalidrawElement[]> => {
  // Buffer should contain both the IV (fixed length) and encrypted data
  const sceneVersion = parseSceneVersionFromRequest(buffer);
  const iv = new Uint8Array(
    buffer.slice(
      SCENE_VERSION_LENGTH_BYTES,
      IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES,
    ),
  );
  const encrypted = buffer.slice(
    IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES,
    buffer.byteLength,
  );

  return await decryptElements(
    { sceneVersion, ciphertext: encrypted, iv },
    key,
  );
};

export const saveFilesToHttpStorage = async ({
  files,
  HTTP_STORAGE_BACKEND_URL,
  token,
}: {
  files: { id: FileId; buffer: Uint8Array }[];
  HTTP_STORAGE_BACKEND_URL: string;
  token?: string;
}) => {
  const erroredFiles = new Map<FileId, true>();
  const savedFiles = new Map<FileId, true>();

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const payloadBlob = new Blob([buffer]);
        const payload = await new Response(payloadBlob).arrayBuffer();
        const headers = getHeaders({ token });
        await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`, {
          method: "PUT",
          body: payload,
          headers,
        });
        savedFiles.set(id, true);
      } catch (error: any) {
        erroredFiles.set(id, true);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const loadFilesFromHttpStorage = async ({
  decryptionKey,
  filesIds,
  HTTP_STORAGE_BACKEND_URL,
  token,
}: {
  decryptionKey: string;
  filesIds: readonly FileId[];
  HTTP_STORAGE_BACKEND_URL: string;
  token?: string;
}) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  //////////////
  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const headers = getHeaders({ token });
        const response = await fetch(
          `${HTTP_STORAGE_BACKEND_URL}/files/${id}`,
          { headers },
        );
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );
  //////

  return { loadedFiles, erroredFiles };
};

const saveElementsToBackend = async ({
  roomKey,
  roomId,
  elements,
  sceneVersion,
  HTTP_STORAGE_BACKEND_URL,
  token,
}: {
  roomKey: string;
  roomId: string;
  elements: SyncableExcalidrawElement[];
  sceneVersion: number;
  HTTP_STORAGE_BACKEND_URL: string;
  token?: string;
}) => {
  const { ciphertext, iv } = await encryptElements(roomKey, elements);

  // Concatenate Scene Version, IV with encrypted data (IV does not have to be secret).
  const numberBuffer = new ArrayBuffer(4);
  const numberView = new DataView(numberBuffer);
  numberView.setUint32(0, sceneVersion, false);
  const sceneVersionBuffer = numberView.buffer;
  const payloadBlob = await new Response(
    new Blob([sceneVersionBuffer, iv.buffer, ciphertext]),
  ).arrayBuffer();
  const headers = getHeaders({ token });
  const putResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
    {
      method: "PUT",
      headers,
      body: payloadBlob,
    },
  );

  return putResponse.ok;
};

const parseSceneVersionFromRequest = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  return view.getUint32(0, false);
};

const decryptElements = async (
  data: StoredScene,
  roomKey: string,
): Promise<readonly RemoteExcalidrawElement[]> => {
  const ciphertext = data.ciphertext;
  const iv = data.iv;

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: encryptedBuffer, iv };
};
