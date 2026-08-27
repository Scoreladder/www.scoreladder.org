/*
 * =========================================================
 * MATCH CONNECTION
 * =========================================================
 *
 * Owns:
 * - Disconnect manager
 * - Reconnect manager
 * - Room connection wrappers
 *
 * Gameplay-specific callbacks are injected from script.js.
 * =========================================================
 */

import {
  API,
  MATCH_DURATION_MS,
  state,
  saveActiveMatchState,
  getStoredActiveMatchState,
  getStoredResumeMatchId,
  clearActiveMatchState
} from "./match-state.js";

import {
  elements,
  setStatus,
  enableResumeGame,
  enableQueueButton,
  updateOpponent,
  refreshPlayerStats,
  setAnswerSelectionLocked
} from "./match-ui.js";

import {
  createDisconnectManager
} from "./match-disconnect.js";

import {
  createReconnectManager
} from "./match-reconnect.js";


let disconnectManager =
  null;

let reconnectManager =
  null;

let reconnectBridge =
  null;


export function initializeMatchConnectionModules(
  callbacks = {}
) {
  if (
    reconnectManager
  ) {
    return reconnectBridge;
  }

  disconnectManager =
    createDisconnectManager({
      state,

      saveActiveMatchState,

      enableResumeGame,

      setStatus
    });

reconnectManager =
createReconnectManager({
  API,
  MATCH_DURATION_MS,

  state,
  elements,

  setStatus,
  saveActiveMatchState,
  getStoredActiveMatchState,
  getStoredResumeMatchId,
  clearActiveMatchState,
  enableResumeGame,
  enableQueueButton,

  updateOpponent,
  refreshPlayerStats,

  startGame,
  startMatchTimer,
  handleGameResult,
  handleSubmissionReceived,
  setAnswerSelectionLocked,

  disconnectManager
});
  reconnectBridge =
    reconnectManager;

  disconnectManager.installPageLifecycleHandlers();

  return reconnectBridge;
}


export function getReconnectManager() {
  return reconnectManager;
}


export function getDisconnectManager() {
  return disconnectManager;
}


export function sendRoomMessage(
  message
) {
  if (!reconnectManager) {
    console.error(
      "Reconnect manager has not been initialized."
    );

    return false;
  }

  return reconnectManager.sendRoomMessage(
    message
  );
}


export function connectToRoom(
  isResume = false
) {
  if (!reconnectManager) {
    console.error(
      "Reconnect manager has not been initialized."
    );

    return null;
  }

  return reconnectManager.connectToRoom(
    isResume
  );
}


export async function resumeExistingMatch() {
  if (!reconnectManager) {
    console.error(
      "Reconnect manager has not been initialized."
    );

    return false;
  }

  return reconnectManager.resumeExistingMatch();
}


export function onMatchFound(
  isResume = false
) {
  if (!reconnectManager) {
    console.error(
      "Reconnect manager has not been initialized."
    );

    return false;
  }

  return reconnectManager.onMatchFound(
    isResume
  );
}