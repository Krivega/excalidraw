import { nanoid } from "nanoid";
import React from "react";
import { trackEvent } from "../../packages/excalidraw/analytics";
import { Card } from "../../packages/excalidraw/components/Card";
import { ExcalidrawLogo } from "../../packages/excalidraw/components/ExcalidrawLogo";
import { ToolButton } from "../../packages/excalidraw/components/ToolButton";
import { MIME_TYPES } from "../../packages/excalidraw/constants";
import {
  encryptData,
  generateEncryptionKey,
} from "../../packages/excalidraw/data/encryption";
import { serializeAsJSON } from "../../packages/excalidraw/data/json";
import { isInitializedImageElement } from "../../packages/excalidraw/element/typeChecks";
import type {
  FileId,
  NonDeletedExcalidrawElement,
} from "../../packages/excalidraw/element/types";
import { useI18n } from "../../packages/excalidraw/i18n";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "../../packages/excalidraw/types";
import { getFrame } from "../../packages/excalidraw/utils";
import { FILE_UPLOAD_MAX_BYTES } from "../app_constants";
import { encodeFilesForUpload } from "../data/FileManager";
import { getStorageBackend } from "../data/config";
import { loadFirebaseStorage } from "../data/firebase";

export const exportToExcalidrawPlus = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
  HTTP_STORAGE_BACKEND_URL: string,
) => {
  const firebase = await loadFirebaseStorage();

  const id = `${nanoid(12)}`;

  const encryptionKey = (await generateEncryptionKey())!;
  const encryptedData = await encryptData(
    encryptionKey,
    serializeAsJSON(elements, appState, files, "database"),
  );

  const blob = new Blob(
    [encryptedData.iv, new Uint8Array(encryptedData.encryptedBuffer)],
    {
      type: MIME_TYPES.binary,
    },
  );

  // FIXME StorageBackend not covered this case, we should remove the use-case in the web page
  await firebase
    .storage()
    .ref(`/migrations/scenes/${id}`)
    .put(blob, {
      customMetadata: {
        data: JSON.stringify({ version: 2, name }),
        created: Date.now().toString(),
      },
    });

  const filesMap = new Map<FileId, BinaryFileData>();
  for (const element of elements) {
    if (isInitializedImageElement(element) && files[element.fileId]) {
      filesMap.set(element.fileId, files[element.fileId]);
    }
  }

  if (filesMap.size) {
    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
    });

    const storageBackend = await getStorageBackend();
    await storageBackend.saveFilesToStorageBackend({
      prefix: `/migrations/files/scenes/${id}`,
      files: filesToUpload,
      HTTP_STORAGE_BACKEND_URL,
    });
  }

  window.open(
    `${
      import.meta.env.VITE_APP_PLUS_APP
    }/import?excalidraw=${id},${encryptionKey}`,
  );
};

export const ExportToExcalidrawPlus: React.FC<{
  elements: readonly NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  name: string;
  HTTP_STORAGE_BACKEND_URL: string;
  onError: (error: Error) => void;
  onSuccess: () => void;
}> = ({
  elements,
  appState,
  files,
  name,
  HTTP_STORAGE_BACKEND_URL,
  onError,
  onSuccess,
}) => {
  const { t } = useI18n();
  return (
    <Card color="primary">
      <div className="Card-icon">
        <ExcalidrawLogo
          style={{
            [`--color-logo-icon` as any]: "#fff",
            width: "2.8rem",
            height: "2.8rem",
          }}
        />
      </div>
      <h2>Excalidraw+</h2>
      <div className="Card-details">
        {t("exportDialog.excalidrawplus_description")}
      </div>
      <ToolButton
        className="Card-button"
        type="button"
        title={t("exportDialog.excalidrawplus_button")}
        aria-label={t("exportDialog.excalidrawplus_button")}
        showAriaLabel={true}
        onClick={async () => {
          try {
            trackEvent("export", "eplus", `ui (${getFrame()})`);
            await exportToExcalidrawPlus(
              elements,
              appState,
              files,
              name,
              HTTP_STORAGE_BACKEND_URL,
            );
            onSuccess();
          } catch (error: any) {
            console.error(error);
            if (error.name !== "AbortError") {
              onError(new Error(t("exportDialog.excalidrawplus_exportError")));
            }
          }
        }}
      />
    </Card>
  );
};
