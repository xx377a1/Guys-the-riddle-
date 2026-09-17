/**
 * y8-sdk.js
 *
 * Official Y8 SDK (ID.net) Integration Module.
 * Provides initialization, advertisement management, rewarded ads,
 * leaderboards, achievements, and cloud save integration.
 *
 * Developer Instructions:
 * 1. Register your game at the Y8 Developer Portal (https://dev.y8.com or https://account.y8.com/developer).
 * 2. Obtain your `appId` (Application ID) and `gameId`.
 * 3. Create your Leaderboard table(s) and Achievements in the Y8 Dashboard.
 * 4. Update `Y8_CONFIG` below with your official credentials.
 */

// ==================== Y8 DEVELOPER CONFIGURATION ====================
// Replace placeholder strings with your actual Y8 Developer Portal values
export const Y8_CONFIG = {
  // Required: Application Key / App ID from Y8 Developer Portal
  appId: 'YOUR_Y8_APP_ID',

  // Optional/Required for ads: Game ID from Y8 Developer Portal
  gameId: 'YOUR_Y8_GAME_ID',

  // Required: Leaderboard Table ID configured in Y8 Dashboard
  leaderboardTableId: 'HighScores',

  // Storage key for Y8 cloud save
  cloudSaveKey: 'arrow_flow_cloud_save_v1',

  // Achievements configured in Y8 Dashboard
  achievements: {
    FIRST_CLEAR: { key: 'first_clear', title: 'First Steps' },
    STARS_10: { key: 'stars_10', title: 'Star Collector' },
    LEVEL_10: { key: 'level_10', title: 'Getting the Hang of It' },
    LEVEL_50: { key: 'level_50', title: 'Puzzle Expert' },
    LEVEL_100: { key: 'level_100', title: 'Arrow Master' }
  }
};

class Y8SDKService {
  constructor() {
    this.isLoaded = false;
    this.isInitialized = false;
    this.userSession = null;
    this.sdkScriptUrl = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
    this.initPromise = null;
  }

  /**
   * Initializes the Y8 SDK dynamically.
   * Handles network issues or ad-blockers gracefully for offline / local testing.
   */
  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      // If window.ID or window.y8Sdk is already present
      if (typeof window !== 'undefined' && (window.ID || window.y8Sdk)) {
        this._setupSDK(resolve);
        return;
      }

      // Dynamically load the official Y8 SDK script from CDN
      const script = document.createElement('script');
      script.src = this.sdkScriptUrl;
      script.async = true;

      // Set timeout for local/offline testing fallback
      const timeoutId = setTimeout(() => {
        console.warn('Y8 SDK script load timed out. Running in offline/local fallback mode.');
        resolve(false);
      }, 3500);

      script.onload = () => {
        clearTimeout(timeoutId);
        this.isLoaded = true;
        this._setupSDK(resolve);
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        console.warn('Y8 SDK script failed to load (e.g., offline or blocked). Fallback active.');
        resolve(false);
      };

      document.head.appendChild(script);
    });

    return this.initPromise;
  }

  /**
   * Internal setup for Y8 / ID.net SDK handshake
   */
  _setupSDK(resolve) {
    try {
      if (window.ID) {
        // Subscribe to Y8 init event
        window.ID.Event.subscribe('id.init', () => {
          this.isInitialized = true;
          console.log('Y8 SDK successfully initialized.');
          this.checkLoginStatus();
          resolve(true);
        });

        // Execute ID.init with configured appId
        if (typeof window.ID.init === 'function') {
          window.ID.init({
            appId: Y8_CONFIG.appId
          });
        } else {
          this.isInitialized = true;
          resolve(true);
        }
      } else if (window.y8Sdk && typeof window.y8Sdk.init === 'function') {
        window.y8Sdk.init({
          appId: Y8_CONFIG.appId,
          gameId: Y8_CONFIG.gameId
        });
        this.isInitialized = true;
        console.log('Y8 SDK (y8Sdk) successfully initialized.');
        resolve(true);
      } else {
        console.warn('Y8 SDK object not found after script load. Fallback active.');
        resolve(false);
      }
    } catch (err) {
      console.warn('Error during Y8 SDK setup:', err);
      resolve(false);
    }
  }

  /**
   * Returns true if the Y8 SDK is loaded and operational.
   */
  isAvailable() {
    return this.isInitialized && (typeof window.ID !== 'undefined' || typeof window.y8Sdk !== 'undefined');
  }

  /**
   * Checks current Y8 player login status without opening a dialog.
   */
  checkLoginStatus(callback) {
    if (!this.isAvailable() || !window.ID || typeof window.ID.getLoginStatus !== 'function') {
      if (callback) callback(null);
      return;
    }

    try {
      window.ID.getLoginStatus((response) => {
        if (response && response.status === 'connected') {
          this.userSession = response.authResponse;
        } else {
          this.userSession = null;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      console.warn('Y8 getLoginStatus error:', e);
      if (callback) callback(null);
    }
  }

  /**
   * Prompts the player to log in to Y8.
   */
  login(callback) {
    if (!this.isAvailable() || !window.ID || typeof window.ID.login !== 'function') {
      console.warn('Y8 SDK Login unavailable.');
      if (callback) callback({ status: 'unavailable' });
      return;
    }

    try {
      window.ID.login((response) => {
        if (response && response.status === 'connected') {
          this.userSession = response.authResponse;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      console.warn('Y8 login error:', e);
      if (callback) callback({ status: 'error', error: e });
    }
  }

  /**
   * Shows a standard Y8 Interstitial Advertisement.
   * Pauses audio/gameplay during the ad break.
   */
  showInterstitialAd(onBeforeAd, onAfterAd) {
    if (onBeforeAd) onBeforeAd();

    if (!this.isAvailable()) {
      console.log('Y8 Ads unavailable. Skipping ad break.');
      if (onAfterAd) onAfterAd();
      return;
    }

    try {
      if (window.ID && window.ID.ads && typeof window.ID.ads.display === 'function') {
        window.ID.ads.display({
          afterAd: () => {
            if (onAfterAd) onAfterAd();
          }
        });
      } else if (window.y8Sdk && typeof window.y8Sdk.nextAds === 'function') {
        window.y8Sdk.nextAds(() => {
          if (onAfterAd) onAfterAd();
        });
      } else {
        if (onAfterAd) onAfterAd();
      }
    } catch (e) {
      console.warn('Y8 Interstitial Ad error:', e);
      if (onAfterAd) onAfterAd();
    }
  }

  /**
   * Shows a Y8 Rewarded Video Advertisement.
   * @param {Function} onBeforeAd - Called before ad begins (pause game/music)
   * @param {Function} onSuccess - Called if player successfully watches the rewarded ad
   * @param {Function} onFail - Called if ad fails, is closed early, or no inventory
   */
  showRewardedAd(onBeforeAd, onSuccess, onFail) {
    if (onBeforeAd) onBeforeAd();

    if (!this.isAvailable()) {
      console.warn('Y8 Rewarded Ads unavailable. Fallback triggered.');
      if (onFail) onFail({ reason: 'sdk_unavailable' });
      return;
    }

    try {
      if (window.ID && window.ID.ads && typeof window.ID.ads.showReward === 'function') {
        window.ID.ads.showReward(
          () => {
            if (onSuccess) onSuccess();
          },
          (err) => {
            if (onFail) onFail(err);
          }
        );
      } else if (window.y8Sdk && typeof window.y8Sdk.showReward === 'function') {
        window.y8Sdk.showReward({
          onSuccess: () => {
            if (onSuccess) onSuccess();
          },
          onFail: (err) => {
            if (onFail) onFail(err);
          }
        });
      } else {
        console.warn('Y8 Rewarded Ad method not supported by SDK build.');
        if (onFail) onFail({ reason: 'unsupported' });
      }
    } catch (e) {
      console.warn('Y8 Rewarded Ad error:', e);
      if (onFail) onFail({ reason: 'error', error: e });
    }
  }

  /**
   * Submits a player's score to the Y8 Leaderboard.
   * @param {number} score - The numerical score value to submit
   * @param {Function} callback - Response callback
   */
  submitScore(score, callback) {
    if (!this.isAvailable()) {
      if (callback) callback({ status: 'offline', score });
      return;
    }

    try {
      if (window.ID && window.ID.GameAPI && window.ID.GameAPI.Leaderboards) {
        window.ID.GameAPI.Leaderboards.save(
          {
            table: Y8_CONFIG.leaderboardTableId,
            score: score,
            highest: true
          },
          (response) => {
            console.log('Y8 Leaderboard score response:', response);
            if (callback) callback(response);
          }
        );
      } else if (window.y8Sdk && typeof window.y8Sdk.saveLeaderboardScore === 'function') {
        window.y8Sdk.saveLeaderboardScore(
          {
            table: Y8_CONFIG.leaderboardTableId,
            score: score
          },
          (response) => {
            if (callback) callback(response);
          }
        );
      } else {
        if (callback) callback({ status: 'unsupported' });
      }
    } catch (e) {
      console.warn('Y8 Leaderboard submit error:', e);
      if (callback) callback({ status: 'error', error: e });
    }
  }

  /**
   * Fetches leaderboard data from Y8.
   */
  fetchLeaderboard(callback) {
    if (!this.isAvailable()) {
      if (callback) callback(null);
      return;
    }

    try {
      if (window.ID && window.ID.GameAPI && window.ID.GameAPI.Leaderboards) {
        window.ID.GameAPI.Leaderboards.list(
          {
            table: Y8_CONFIG.leaderboardTableId,
            highest: true
          },
          (response) => {
            if (callback) callback(response);
          }
        );
      } else {
        if (callback) callback(null);
      }
    } catch (e) {
      console.warn('Y8 Leaderboard fetch error:', e);
      if (callback) callback(null);
    }
  }

  /**
   * Awards an achievement to the player on Y8.
   * @param {string} achievementKey - The achievement key from Y8_CONFIG
   * @param {Function} callback - Response callback
   */
  unlockAchievement(achievementKey, callback) {
    if (!this.isAvailable()) {
      if (callback) callback({ status: 'offline', achievementKey });
      return;
    }

    const achConfig = Object.values(Y8_CONFIG.achievements).find(a => a.key === achievementKey) || {
      key: achievementKey,
      title: achievementKey
    };

    try {
      if (window.ID && window.ID.GameAPI && window.ID.GameAPI.Achievements) {
        window.ID.GameAPI.Achievements.save(
          {
            achievement: achConfig.title,
            achievement_key: achConfig.key
          },
          (response) => {
            console.log('Y8 Achievement response:', response);
            if (callback) callback(response);
          }
        );
      } else if (window.y8Sdk && typeof window.y8Sdk.awardAchievement === 'function') {
        window.y8Sdk.awardAchievement(
          {
            achievement: achConfig.title
          },
          (response) => {
            if (callback) callback(response);
          }
        );
      } else {
        if (callback) callback({ status: 'unsupported' });
      }
    } catch (e) {
      console.warn('Y8 Achievement unlock error:', e);
      if (callback) callback({ status: 'error', error: e });
    }
  }

  /**
   * Saves game progress to Y8 Cloud Storage.
   * @param {Object} saveData - JSON-serializable object containing progress
   * @param {Function} callback - Response callback
   */
  cloudSave(saveData, callback) {
    if (!this.isAvailable() || !window.ID || typeof window.ID.api !== 'function') {
      if (callback) callback({ status: 'offline', savedLocally: true });
      return;
    }

    try {
      window.ID.api(
        'user_data/submit',
        'POST',
        {
          key: Y8_CONFIG.cloudSaveKey,
          value: JSON.stringify(saveData)
        },
        (response) => {
          console.log('Y8 Cloud Save response:', response);
          if (callback) callback(response);
        }
      );
    } catch (e) {
      console.warn('Y8 Cloud Save error:', e);
      if (callback) callback({ status: 'error', error: e });
    }
  }

  /**
   * Loads game progress from Y8 Cloud Storage.
   * @param {Function} callback - Callback with parsed JSON data or null
   */
  cloudLoad(callback) {
    if (!this.isAvailable() || !window.ID || typeof window.ID.api !== 'function') {
      if (callback) callback(null);
      return;
    }

    try {
      window.ID.api(
        'user_data/retrieve',
        'POST',
        {
          key: Y8_CONFIG.cloudSaveKey
        },
        (response) => {
          if (response && response.status === 'ok' && response.jsondata) {
            try {
              const data = typeof response.jsondata === 'string' ? JSON.parse(response.jsondata) : response.jsondata;
              if (callback) callback(data);
            } catch (jsonErr) {
              console.warn('Y8 Cloud Load parse error:', jsonErr);
              if (callback) callback(null);
            }
          } else {
            if (callback) callback(null);
          }
        }
      );
    } catch (e) {
      console.warn('Y8 Cloud Load error:', e);
      if (callback) callback(null);
    }
  }
}

// Export singleton instance
export const y8SDK = new Y8SDKService();
export default y8SDK;
