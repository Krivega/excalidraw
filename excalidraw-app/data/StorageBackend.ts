import type { Socket as ISocketIO } from "socket.io-client";
import { SyncableExcalidrawElement } from ".";
import {
  ExcalidrawElement,
  FileId,
} from "../../packages/excalidraw/element/types";
import { AppState, BinaryFileData } from "../../packages/excalidraw/types";
import Portal from "../collab/Portal";

export interface StorageBackend {
  isSaved: (portal: Portal, elements: readonly ExcalidrawElement[]) => boolean;
  saveToStorageBackend: (parameters: {
    portal: Portal;
    elements: readonly SyncableExcalidrawElement[];
    appState: AppState;
    HTTP_STORAGE_BACKEND_URL: string;
    token?: string;
  }) => Promise<SyncableExcalidrawElement[] | null>;
  loadFromStorageBackend: (parameters: {
    roomId: string;
    roomKey: string;
    socket: ISocketIO | null;
    HTTP_STORAGE_BACKEND_URL: string;
    token?: string;
  }) => Promise<readonly ExcalidrawElement[] | null>;
  saveFilesToStorageBackend: (parameters: {
    prefix: string;
    files: {
      id: FileId;
      buffer: Uint8Array;
    }[];
    HTTP_STORAGE_BACKEND_URL: string;
    token?: string;
  }) => Promise<{
    savedFiles: Map<FileId, true>;
    erroredFiles: Map<FileId, true>;
  }>;
  loadFilesFromStorageBackend: (parameters: {
    prefix: string;
    decryptionKey: string;
    filesIds: readonly FileId[];
    HTTP_STORAGE_BACKEND_URL: string;
    token?: string;
  }) => Promise<{
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  }>;
}

export interface StoredScene {
  sceneVersion: number;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}
