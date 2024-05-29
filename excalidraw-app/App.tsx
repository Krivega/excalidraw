import clsx from "clsx";
import LanguageDetector from "i18next-browser-languagedetector";
import { Provider, atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  StoreAction,
  defaultLang,
  reconcileElements,
} from "../packages/excalidraw";
import { trackEvent } from "../packages/excalidraw/analytics";
import { getDefaultAppState } from "../packages/excalidraw/appState";
import { ErrorDialog } from "../packages/excalidraw/components/ErrorDialog";
import { EVENT, VERSION_TIMEOUT } from "../packages/excalidraw/constants";
import { loadFromBlob } from "../packages/excalidraw/data/blob";
import { useHandleLibrary } from "../packages/excalidraw/data/library";
import type { RestoredDataState } from "../packages/excalidraw/data/restore";
import { restoreAppState } from "../packages/excalidraw/data/restore";
import { newElementWith } from "../packages/excalidraw/element/mutateElement";
import { isInitializedImageElement } from "../packages/excalidraw/element/typeChecks";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "../packages/excalidraw/element/types";
import { useCallbackRefState } from "../packages/excalidraw/hooks/useCallbackRefState";
import { t } from "../packages/excalidraw/i18n";
import { useAtomWithInitialValue } from "../packages/excalidraw/jotai";
import polyfill from "../packages/excalidraw/polyfill";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIAppState,
} from "../packages/excalidraw/types";
import type { ResolvablePromise } from "../packages/excalidraw/utils";
import {
  debounce,
  getFrame,
  getVersion,
  isRunningInIframe,
  isTestEnv,
  resolvablePromise,
} from "../packages/excalidraw/utils";
import CustomStats from "./CustomStats";
import { appJotaiStore } from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import type { CollabAPI } from "./collab/Collab";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { exportToBackend, loadScene } from "./data";
import { updateStaleImageStatuses } from "./data/FileManager";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
} from "./data/LocalData";
import { importFromLocalStorage } from "./data/localStorage";
import { isBrowserStorageStateNewer } from "./data/tabSync";

import { DEFAULT_CATEGORIES } from "../packages/excalidraw/components/CommandPalette/CommandPalette";
import { openConfirmModal } from "../packages/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "../packages/excalidraw/components/Trans";
import { ExcalLogo } from "../packages/excalidraw/components/icons";
import type { RemoteExcalidrawElement } from "../packages/excalidraw/data/reconcile";
import type { ResolutionType } from "../packages/excalidraw/utility-types";
import { collabErrorIndicatorAtom } from "./collab/CollabError";
import { getStorageBackend, storageBackend } from "./data/config";
import "./index.scss";
import { shareDialogStateAtom } from "./share/ShareDialog";
import { appThemeAtom, useHandleAppTheme } from "./useHandleAppTheme";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

// let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
// window.addEventListener(
//   "beforeinstallprompt",
//   (event: BeforeInstallPromptEvent) => {
//     // prevent Chrome <= 67 from automatically showing the prompt
//     event.preventDefault();
//     // cache for later use
//     pwaEvent = event;
//   },
// );

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const languageDetector = new LanguageDetector();
languageDetector.init({
  languageUtils: {},
});

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
  id?: string;
  jsonId?: string;
  jsonPrivateKey?: string;
  externalUrl?: string;
  roomId?: string;
  roomKey?: string;
  token?: string;
  wsServerUrl?: string;
  wsServerPath?: string;
  BACKEND_V2_GET: string;
  onError: (error: Error) => void;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  let {
    id,
    jsonId,
    jsonPrivateKey,
    externalUrl,
    roomId,
    roomKey,
    token,
    wsServerUrl,
    wsServerPath,
    BACKEND_V2_GET,
    onError,
  } = opts;
  const localDataState = importFromLocalStorage();

  let scene: RestoredDataState & {
    scrollToContent?: boolean;
  } = await loadScene({ localDataState, BACKEND_V2_GET, token, onError });

  const isExternalScene = !!(
    id ||
    jsonId ||
    jsonPrivateKey ||
    roomId ||
    roomKey
  );
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomId ||
      roomKey ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonId && jsonPrivateKey) {
        scene = await loadScene({
          id: jsonId,
          privateKey: jsonPrivateKey,
          localDataState,
          BACKEND_V2_GET,
          token,
          onError,
        });
      }
      scene.scrollToContent = true;
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomId = undefined;
      roomKey = undefined;
    }
  } else if (externalUrl) {
    try {
      const request = await fetch(window.decodeURIComponent(externalUrl));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomId && roomKey && wsServerUrl && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration({
      roomId,
      roomKey,
      wsServerUrl,
      wsServerPath,
    });

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomId,
      key: roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonId && jsonPrivateKey
      ? {
          scene,
          isExternalScene,
          id: jsonId,
          key: jsonPrivateKey,
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const detectedLangCode = languageDetector.detect() || defaultLang.code;
export const appLangCodeAtom = atom(
  Array.isArray(detectedLangCode) ? detectedLangCode[0] : detectedLangCode,
);

type TProps = {
  username: string;
  id?: string;
  jsonId?: string;
  jsonPrivateKey?: string;
  externalUrl?: string;
  roomId?: string;
  roomKey?: string;
  token?: string;
  wsServerUrl?: string;
  wsServerPath?: string;
  langCode?: string;
  isCollaborating?: boolean;
  isLaserPointerButton?: boolean;
  BACKEND_V2_POST: string;
  BACKEND_V2_GET: string;
  HTTP_STORAGE_BACKEND_URL: string;
  onError: (error: Error) => void;
};

const ExcalidrawWrapper = ({
  username,
  id,
  jsonId,
  jsonPrivateKey,
  externalUrl,
  roomId,
  roomKey,
  token,
  wsServerUrl,
  wsServerPath,
  BACKEND_V2_POST,
  BACKEND_V2_GET,
  HTTP_STORAGE_BACKEND_URL,
  langCode: langCodeFromProps,
  onError,
  isCollaborating: isCollaborationLink,
  isLaserPointerButton,
}: TProps) => {
  const [errorMessage, setErrorMessage] = useState("");
  const [langCode, setLangCode] = useAtom(appLangCodeAtom);
  const isCollabDisabled = isRunningInIframe();

  const [appTheme, setAppTheme] = useAtom(appThemeAtom);
  const { editorTheme } = useHandleAppTheme();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    const timer = setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return !!isCollaborationLink;
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    const loadImages = (
      data: ResolutionType<typeof initializeScene>,
      isInitialLoad = false,
    ) => {
      if (!data.scene) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const filesIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          storageBackend
            ?.loadFilesFromStorageBackend({
              prefix: `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
              decryptionKey: data.key,
              filesIds,
              HTTP_STORAGE_BACKEND_URL,
              token,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        } else if (isInitialLoad) {
          if (filesIds.length) {
            LocalData.fileStorage
              .getFiles(filesIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({
            currentFileIds: filesIds,
          });
        }
      }
    };

    initializeScene({
      collabAPI,
      excalidrawAPI,
      id,
      jsonId,
      jsonPrivateKey,
      externalUrl,
      roomId,
      roomKey,
      token,
      wsServerUrl,
      wsServerPath,
      BACKEND_V2_GET,
      onError,
    }).then(async (data) => {
      // Init storageBackend before use it
      await getStorageBackend();
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          let langCode =
            langCodeFromProps || languageDetector.detect() || defaultLang.code;
          if (Array.isArray(langCode)) {
            langCode = langCode[0];
          }
          setLangCode(langCode);
          excalidrawAPI.updateScene({
            ...localDataState,
            storeAction: StoreAction.UPDATE,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username);
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const filesIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (filesIds.length) {
            LocalData.fileStorage
              .getFiles(filesIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [
    isCollabDisabled,
    collabAPI,
    excalidrawAPI,
    setLangCode,
    username,
    isCollaborating,
    id,
    jsonId,
    jsonPrivateKey,
    externalUrl,
    langCodeFromProps,
    roomId,
    roomKey,
    wsServerUrl,
    wsServerPath,
    BACKEND_V2_GET,
    HTTP_STORAGE_BACKEND_URL,
    token,
    onError,
  ]);

  useEffect(() => {
    return () => {
      LocalData.flushSave();
    };
  }, []);

  useEffect(() => {
    languageDetector.cacheUserLanguage(langCode);
  }, [langCode]);

  const updateScene = () => {
    if (excalidrawAPI) {
      let didChange = false;

      const localElements = excalidrawAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => {
          if (LocalData.fileStorage.shouldUpdateImageElementStatus(element)) {
            const newElement = newElementWith(element, { status: "saved" });
            if (newElement !== element) {
              didChange = true;
            }
            return newElement;
          }
          return element;
        });

      if (didChange) {
        excalidrawAPI.updateScene({
          elements: localElements,
          storeAction: StoreAction.UPDATE,
        });
      }
    }
  };

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const isCollaborating = collabAPI?.isCollaborating();

    if (isCollaborating) {
      collabAPI?.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, updateScene);
    } else if (isCollaborating) {
      updateScene();
    }
  };

  const onUnload = async (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const isCollaborating = collabAPI?.isCollaborating();
    if (isCollaborating) {
      await collabAPI?.syncElements(elements, { fireImmediately: true });
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {});
    }
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend({
        elements: exportedElements,
        appState: {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
        BACKEND_V2_POST,
        HTTP_STORAGE_BACKEND_URL,
        token,
      });

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  const ExcalidrawPlusCommand = {
    label: "Excalidraw+",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: ["plus", "cloud", "server"],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };
  const ExcalidrawPlusAppCommand = {
    label: "Sign up",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: [
      "excalidraw",
      "plus",
      "cloud",
      "server",
      "signin",
      "login",
      "signup",
    ],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_APP
        }?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        onChange={onChange}
        onUnload={onUnload}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        UIOptions={{
          isLaserPointerButton,
          canvasActions: {
            toggleTheme: true,
            export: {
              onExportToBackend,
              renderCustomUI: excalidrawAPI
                ? (elements, appState, files) => {
                    return <></>;
                    // return (
                    //   <ExportToExcalidrawPlus
                    //     elements={elements}
                    //     appState={appState}
                    //     files={files}
                    //     name={excalidrawAPI.getName()}
                    //     HTTP_STORAGE_BACKEND_URL={HTTP_STORAGE_BACKEND_URL}
                    //     onError={(error) => {
                    //       excalidrawAPI?.updateScene({
                    //         appState: {
                    //           errorMessage: error.message,
                    //         },
                    //       });
                    //     }}
                    //     onSuccess={() => {
                    //       excalidrawAPI.updateScene({
                    //         appState: { openDialog: null },
                    //       });
                    //     }}
                    //   />
                    // );
                  }
                : undefined,
            },
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        renderTopRightUI={(isMobile) => {
          return null;
          // if (isMobile || !collabAPI || isCollabDisabled) {
          //   return null;
          // }
          // return (
          //   <div className="top-right-ui">
          //     {collabError.message && <CollabError collabError={collabError} />}
          //     <LiveCollaborationTrigger
          //       isCollaborating={isCollaborating}
          //       onSelect={() =>
          //         setShareDialogState({ isOpen: true, type: "share" })
          //       }
          //     />
          //   </div>
          // );
        }}
      >
        {/* <AppMainMenu
          onCollabDialogOpen={onCollabDialogOpen}
          isCollaborating={isCollaborating}
          isCollabEnabled={!isCollabDisabled}
          theme={appTheme}
          setTheme={(theme) => setAppTheme(theme)}
        /> */}
        {/* <AppWelcomeScreen
          onCollabDialogOpen={onCollabDialogOpen}
          isCollabEnabled={!isCollabDisabled}
        /> */}
        {/* <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
          {excalidrawAPI && (
            <OverwriteConfirmDialog.Action
              title={t("overwriteConfirm.action.excalidrawPlus.title")}
              actionLabel={t("overwriteConfirm.action.excalidrawPlus.button")}
              onClick={() => {
                exportToExcalidrawPlus(
                  excalidrawAPI.getSceneElements(),
                  excalidrawAPI.getAppState(),
                  excalidrawAPI.getFiles(),
                  excalidrawAPI.getName(),
                  HTTP_STORAGE_BACKEND_URL,
                );
              }}
            >
              {t("overwriteConfirm.action.excalidrawPlus.description")}
            </OverwriteConfirmDialog.Action>
          )}
        </OverwriteConfirmDialog> */}
        {/* <AppFooter /> */}
        {/* <TTDDialog
          onTextSubmit={async (input) => {
            try {
              const response = await fetch(
                `${
                  import.meta.env.VITE_APP_AI_BACKEND
                }/v1/ai/text-to-diagram/generate`,
                {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ prompt: input }),
                },
              );

              const rateLimit = response.headers.has("X-Ratelimit-Limit")
                ? parseInt(response.headers.get("X-Ratelimit-Limit") || "0", 10)
                : undefined;

              const rateLimitRemaining = response.headers.has(
                "X-Ratelimit-Remaining",
              )
                ? parseInt(
                    response.headers.get("X-Ratelimit-Remaining") || "0",
                    10,
                  )
                : undefined;

              const json = await response.json();

              if (!response.ok) {
                if (response.status === 429) {
                  return {
                    rateLimit,
                    rateLimitRemaining,
                    error: new Error(
                      "Too many requests today, please try again tomorrow!",
                    ),
                  };
                }

                throw new Error(json.message || "Generation failed...");
              }

              const generatedResponse = json.generatedResponse;
              if (!generatedResponse) {
                throw new Error("Generation failed...");
              }

              return { generatedResponse, rateLimit, rateLimitRemaining };
            } catch (err: any) {
              throw new Error("Request failed");
            }
          }}
        /> */}
        {/* <TTDDialogTrigger /> */}
        {isCollaborating && isOffline && (
          <div className="collab-offline-warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {/* {latestShareableLink && (
          <ShareableLinkDialog
            link={latestShareableLink}
            onCloseRequest={() => setLatestShareableLink(null)}
            setErrorMessage={setErrorMessage}
          />
        )} */}
        {excalidrawAPI && !isCollabDisabled && (
          <Collab
            username={username}
            token={token}
            excalidrawAPI={excalidrawAPI}
            HTTP_STORAGE_BACKEND_URL={HTTP_STORAGE_BACKEND_URL}
            onError={onError}
          />
        )}

        {/* <ShareDialog
          collabAPI={collabAPI}
          onExportToBackend={async () => {
            if (excalidrawAPI) {
              try {
                await onExportToBackend(
                  excalidrawAPI.getSceneElements(),
                  excalidrawAPI.getAppState(),
                  excalidrawAPI.getFiles(),
                );
              } catch (error: any) {
                setErrorMessage(error.message);
              }
            }
          }}
        /> */}

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        {/* <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.liveCollaboration"),
              category: DEFAULT_CATEGORIES.app,
              keywords: [
                "team",
                "multiplayer",
                "share",
                "public",
                "session",
                "invite",
              ],
              icon: usersIcon,
              perform: () => {
                setShareDialogState({
                  isOpen: true,
                  type: "collaborationOnly",
                });
              },
            },
            {
              label: t("roomDialog.button_stopSession"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!collabAPI?.isCollaborating(),
              keywords: [
                "stop",
                "session",
                "end",
                "leave",
                "close",
                "exit",
                "collaboration",
              ],
              perform: () => {
                if (collabAPI) {
                  collabAPI.stopCollaboration();
                  if (!collabAPI.isCollaborating()) {
                    setShareDialogState({ isOpen: false });
                  }
                }
              },
            },
            {
              label: t("labels.share"),
              category: DEFAULT_CATEGORIES.app,
              predicate: true,
              icon: share,
              keywords: [
                "link",
                "shareable",
                "readonly",
                "export",
                "publish",
                "snapshot",
                "url",
                "collaborate",
                "invite",
              ],
              perform: async () => {
                setShareDialogState({ isOpen: true, type: "share" });
              },
            },
            {
              label: "GitHub",
              icon: GithubIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: [
                "issues",
                "bugs",
                "requests",
                "report",
                "features",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://github.com/excalidraw/excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.followUs"),
              icon: XBrandIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["twitter", "contact", "social", "community"],
              perform: () => {
                window.open(
                  "https://x.com/excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.discordChat"),
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              icon: DiscordIcon,
              keywords: [
                "chat",
                "talk",
                "contact",
                "bugs",
                "requests",
                "report",
                "feedback",
                "suggestions",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://discord.gg/UexuTaE",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: "YouTube",
              icon: youtubeIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["features", "tutorials", "howto", "help", "community"],
              perform: () => {
                window.open(
                  "https://youtube.com/@excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            ...(isExcalidrawPlusSignedUser
              ? [
                  {
                    ...ExcalidrawPlusAppCommand,
                    label: "Sign in / Go to Excalidraw+",
                  },
                ]
              : [ExcalidrawPlusCommand, ExcalidrawPlusAppCommand]),

            {
              label: t("overwriteConfirm.action.excalidrawPlus.button"),
              category: DEFAULT_CATEGORIES.export,
              icon: exportToPlus,
              predicate: true,
              keywords: ["plus", "export", "save", "backup"],
              perform: () => {
                if (excalidrawAPI) {
                  exportToExcalidrawPlus(
                    excalidrawAPI.getSceneElements(),
                    excalidrawAPI.getAppState(),
                    excalidrawAPI.getFiles(),
                    excalidrawAPI.getName(),
                    HTTP_STORAGE_BACKEND_URL,
                  );
                }
              },
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        /> */}
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = ({
  username,
  id,
  jsonId,
  jsonPrivateKey,
  externalUrl,
  roomId,
  roomKey,
  token,
  wsServerUrl,
  wsServerPath,
  langCode,
  isCollaborating,
  isLaserPointerButton,
  BACKEND_V2_POST,
  BACKEND_V2_GET,
  HTTP_STORAGE_BACKEND_URL,
  onError,
}: TProps) => {
  return (
    <TopErrorBoundary>
      <Provider unstable_createStore={() => appJotaiStore}>
        <ExcalidrawWrapper
          username={username}
          id={id}
          jsonId={jsonId}
          jsonPrivateKey={jsonPrivateKey}
          externalUrl={externalUrl}
          roomId={roomId}
          roomKey={roomKey}
          token={token}
          wsServerUrl={wsServerUrl}
          wsServerPath={wsServerPath}
          langCode={langCode}
          isCollaborating={isCollaborating}
          isLaserPointerButton={isLaserPointerButton}
          BACKEND_V2_POST={BACKEND_V2_POST}
          BACKEND_V2_GET={BACKEND_V2_GET}
          HTTP_STORAGE_BACKEND_URL={HTTP_STORAGE_BACKEND_URL}
          onError={onError}
        />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
