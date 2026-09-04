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
 * Gameplay-specific callbacks are injected from game.js /
 * script.js through initializeMatchConnectionModules().
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


/* =========================================================
   MANAGERS
   ========================================================= */

let disconnectManager = null;
let reconnectManager = null;
let reconnectBridge = null;


/* =========================================================
   INITIALIZE CONNECTION MODULES
   ========================================================= */

export function initializeMatchConnectionModules(
  callbacks = {}
) {
  /*
   * Managers should only be initialized once.
   */
  if (reconnectManager) {
    return reconnectBridge;
  }


  /* =======================================================
     GAMEPLAY CALLBACKS
     =======================================================

     Gameplay logic belongs to match-game.js.

     The connection layer only forwards the relevant
     server events to the supplied callbacks.
  */

  const startGame =
    typeof callbacks.startGame === "function"
      ? callbacks.startGame
      : null;

  const startMatchTimer =
    typeof callbacks.startMatchTimer === "function"
      ? callbacks.startMatchTimer
      : null;

  const handleGameResult =
    typeof callbacks.handleGameResult === "function"
      ? callbacks.handleGameResult
      : null;

  const handleSubmissionReceived =
    typeof callbacks.handleSubmissionReceived === "function"
      ? callbacks.handleSubmissionReceived
      : null;


  /* =======================================================
     DISCONNECT MANAGER
     ======================================================= */

  disconnectManager =
    createDisconnectManager({
      state,
      saveActiveMatchState,
      enableResumeGame,
      setStatus
    });


  /* =======================================================
     RECONNECT MANAGER
     ======================================================= */

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

      /*
       * Gameplay callbacks.
       */
      startGame,
      startMatchTimer,
      handleGameResult,
      handleSubmissionReceived,

      setAnswerSelectionLocked,

      disconnectManager
    });

  reconnectBridge =
    reconnectManager;


  /* =======================================================
     PAGE LIFECYCLE
     ======================================================= */

  disconnectManager.installPageLifecycleHandlers();

  return reconnectBridge;
}


/* =========================================================
   GET RECONNECT MANAGER
   ========================================================= */

export function getReconnectManager() {
  return reconnectManager;
}


/* =========================================================
   GET DISCONNECT MANAGER
   ========================================================= */

export function getDisconnectManager() {
  return disconnectManager;
}


/* =========================================================
   SEND ROOM MESSAGE
   ========================================================= */

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


/* =========================================================
   CONNECT TO ROOM
   ========================================================= */

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


/* =========================================================
   RESUME EXISTING MATCH
   ========================================================= */

export async function resumeExistingMatch() {
  if (!reconnectManager) {
    console.error(
      "Reconnect manager has not been initialized."
    );

    return false;
  }

  return reconnectManager.resumeExistingMatch();
}


/* =========================================================
   MATCH FOUND
   ========================================================= */

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