import throttle from "lodash.throttle";
import type { Socket } from "socket.io-client";
import { trackEvent } from "../../packages/excalidraw/analytics";
import { encryptData } from "../../packages/excalidraw/data/encryption";
import { newElementWith } from "../../packages/excalidraw/element/mutateElement";
import { OrderedExcalidrawElement } from "../../packages/excalidraw/element/types";
import {
  OnUserFollowedPayload,
  SocketId,
  UserIdleState,
} from "../../packages/excalidraw/types";
import { FILE_UPLOAD_TIMEOUT, WS_EVENTS, WS_SUBTYPES } from "../app_constants";
import {
  isSyncableElement,
  SocketUpdateData,
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";
import { TCollabClass } from "./Collab";

class Portal {
  collab: TCollabClass;
  socket: Socket | null = null;
  socketInitialized: boolean = false; // we don't want the socket to emit any updates until it is fully initialized
  roomId: string | null = null;
  roomKey: string | null = null;
  broadcastedElementVersions: Map<string, number> = new Map();

  constructor(collab: TCollabClass) {
    this.collab = collab;
  }

  open({ socket, id, key }: { socket: Socket; id: string; key: string }) {
    this.socket = socket;
    this.roomId = id;
    this.roomKey = key;

    // Initialize socket listeners
    this.socket.on("init-room", () => {
      if (this.socket) {
        this.socket.emit("join-room", this.roomId);
        trackEvent("share", "room joined");
      }
    });
    this.socket.on("new-user", async (_socketId: string) => {
      this.broadcastScene(
        WS_SUBTYPES.INIT,
        this.collab.getSceneElementsIncludingDeleted(),
        /* syncAll */ true,
      );
    });
    this.socket.on("room-user-change", (clients: SocketId[]) => {
      this.collab.setCollaborators(clients);
    });

    return socket;
  }

  get socketId() {
    return this.socket?.io?.engine?.id as SocketId | undefined;
  }

  close() {
    if (!this.socket) {
      return;
    }
    this.queueFileUpload.flush();
    this.socket.close();
    this.socket = null;
    this.roomId = null;
    this.roomKey = null;
    this.socketInitialized = false;
    this.broadcastedElementVersions = new Map();
  }

  isOpen() {
    return !!(
      this.socketInitialized &&
      this.socket &&
      this.roomId &&
      this.roomKey
    );
  }

  async _broadcastSocketData(
    data: SocketUpdateData,
    volatile: boolean = false,
    roomId?: string,
  ) {
    if (this.isOpen()) {
      const json = JSON.stringify(data);
      const encoded = new TextEncoder().encode(json);
      const { encryptedBuffer, iv } = await encryptData(this.roomKey!, encoded);

      this.socket?.emit(
        volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
        roomId ?? this.roomId,
        encryptedBuffer,
        iv,
      );
    }
  }

  queueFileUpload = throttle(async () => {
    try {
      await this.collab.fileManager.saveFiles({
        elements: this.collab.excalidrawAPI.getSceneElementsIncludingDeleted(),
        files: this.collab.excalidrawAPI.getFiles(),
      });
    } catch (error: any) {
      if (error.name !== "AbortError") {
        this.collab.excalidrawAPI.updateScene({
          appState: {
            errorMessage: error.message,
          },
        });
      }
    }

    this.collab.excalidrawAPI.updateScene({
      elements: this.collab.excalidrawAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => {
          if (this.collab.fileManager.shouldUpdateImageElementStatus(element)) {
            // this will signal collaborators to pull image data from server
            // (using mutation instead of newElementWith otherwise it'd break
            // in-progress dragging)
            return newElementWith(element, { status: "saved" });
          }
          return element;
        }),
    });
  }, FILE_UPLOAD_TIMEOUT);

  broadcastScene = async (
    updateType: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
    elements: readonly OrderedExcalidrawElement[],
    syncAll: boolean,
  ) => {
    if (updateType === WS_SUBTYPES.INIT && !syncAll) {
      throw new Error("syncAll must be true when sending SCENE.INIT");
    }

    // sync out only the elements we think we need to to save bandwidth.
    // periodically we'll resync the whole thing to make sure no one diverges
    // due to a dropped message (server goes down etc).
    const syncableElements = elements.reduce((acc, element) => {
      if (
        (syncAll ||
          !this.broadcastedElementVersions.has(element.id) ||
          element.version > this.broadcastedElementVersions.get(element.id)!) &&
        isSyncableElement(element)
      ) {
        acc.push(element);
      }
      return acc;
    }, [] as SyncableExcalidrawElement[]);

    const data: SocketUpdateDataSource[typeof updateType] = {
      type: updateType,
      payload: {
        elements: syncableElements,
      },
    };

    for (const syncableElement of syncableElements) {
      this.broadcastedElementVersions.set(
        syncableElement.id,
        syncableElement.version,
      );
    }

    this.queueFileUpload();

    await this._broadcastSocketData(data as SocketUpdateData);
  };

  broadcastIdleChange = (userState: UserIdleState) => {
    const socketId = this.socketId;
    if (socketId) {
      const data: SocketUpdateDataSource["IDLE_STATUS"] = {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId,
          userState,
          username: this.collab.state.username,
        },
      };
      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  broadcastMouseLocation = (payload: {
    pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
    button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
  }) => {
    const socketId = this.socketId;
    if (socketId) {
      const data: SocketUpdateDataSource["MOUSE_LOCATION"] = {
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId,
          pointer: payload.pointer,
          button: payload.button || "up",
          selectedElementIds:
            this.collab.excalidrawAPI.getAppState().selectedElementIds,
          username: this.collab.state.username,
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  broadcastVisibleSceneBounds = (
    payload: {
      sceneBounds: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"]["payload"]["sceneBounds"];
    },
    roomId: string,
  ) => {
    const socketId = this.socketId;
    if (socketId) {
      const data: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"] = {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
        payload: {
          socketId,
          username: this.collab.state.username,
          sceneBounds: payload.sceneBounds,
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
        roomId,
      );
    }
  };

  broadcastUserFollowed = (payload: OnUserFollowedPayload) => {
    if (this.socket?.id) {
      this.socket.emit(WS_EVENTS.USER_FOLLOW_CHANGE, payload);
    }
  };
}

export default Portal;
