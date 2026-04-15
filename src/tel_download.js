// ==UserScript==
// @name         Telegram Media Downloader
// @name:en      Telegram Media Downloader
// @name:zh-CN   Telegram 受限图片视频下载器
// @name:zh-TW   Telegram 受限圖片影片下載器
// @name:ru      Telegram: загрузчик медиафайлов
// @version      1.300
// @namespace    https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @description  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:en  Download images, GIFs, videos, and voice messages on the Telegram webapp from private channels that disable downloading and restrict saving content
// @description:ru Загружайте изображения, GIF-файлы, видео и голосовые сообщения в веб-приложении Telegram из частных каналов, которые отключили загрузку и ограничили сохранение контента
// @description:zh-CN 从禁止下载的Telegram频道中下载图片、视频及语音消息
// @description:zh-TW 從禁止下載的 Telegram 頻道中下載圖片、影片及語音訊息
// @author       Nestor Qin
// @license      GNU GPLv3
// @website      https://github.com/Neet-Nestor/Telegram-Media-Downloader
// @match        https://web.telegram.org/*
// @match        https://webk.telegram.org/*
// @match        https://webz.telegram.org/*
// @icon         https://img.icons8.com/color/452/telegram-app--v5.png
// ==/UserScript==


(function () {
  const logger = {
    info: (message, fileName = null) => {
      console.log(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
    error: (message, fileName = null) => {
      console.error(
        `[Tel Download] ${fileName ? `${fileName}: ` : ""}${message}`
      );
    },
  };
  // Unicode values for icons (used in /k/ app)
  // https://github.com/morethanwords/tweb/blob/master/src/icons.ts
  const DOWNLOAD_ICON = "\ue979";
  const FORWARD_ICON = "\ue99a";
  const contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
  const REFRESH_DELAY = 500;
  const hashCode = (s) => {
    var h = 0,
      l = s.length,
      i = 0;
    if (l > 0) {
      while (i < l) {
        h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
      }
    }
    return h >>> 0;
  };

  const createProgressBar = (videoId, fileName) => {
    const isDarkMode =
      document.querySelector("html").classList.contains("night") ||
      document.querySelector("html").classList.contains("theme-dark");
    const container = document.getElementById(
      "tel-downloader-progress-bar-container"
    );
    const innerContainer = document.createElement("div");
    innerContainer.id = "tel-downloader-progress-" + videoId;
    innerContainer.style.width = "20rem";
    innerContainer.style.marginTop = "0.4rem";
    innerContainer.style.padding = "0.6rem";
    innerContainer.style.backgroundColor = isDarkMode
      ? "rgba(0,0,0,0.3)"
      : "rgba(0,0,0,0.6)";

    const flexContainer = document.createElement("div");
    flexContainer.style.display = "flex";
    flexContainer.style.justifyContent = "space-between";

    const title = document.createElement("p");
    title.className = "filename";
    title.style.margin = 0;
    title.style.color = "white";
    title.innerText = fileName;

    const closeButton = document.createElement("div");
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "1.2rem";
    closeButton.style.color = isDarkMode ? "#8a8a8a" : "white";
    closeButton.innerHTML = "&times;";
    closeButton.onclick = function () {
      container.removeChild(innerContainer);
    };

    const progressBar = document.createElement("div");
    progressBar.className = "progress";
    progressBar.style.backgroundColor = "#e2e2e2";
    progressBar.style.position = "relative";
    progressBar.style.width = "100%";
    progressBar.style.height = "1.6rem";
    progressBar.style.borderRadius = "2rem";
    progressBar.style.overflow = "hidden";

    const counter = document.createElement("p");
    counter.style.position = "absolute";
    counter.style.zIndex = 5;
    counter.style.left = "50%";
    counter.style.top = "50%";
    counter.style.transform = "translate(-50%, -50%)";
    counter.style.margin = 0;
    counter.style.color = "black";
    const progress = document.createElement("div");
    progress.style.position = "absolute";
    progress.style.height = "100%";
    progress.style.width = "0%";
    progress.style.backgroundColor = "#6093B5";

    progressBar.appendChild(counter);
    progressBar.appendChild(progress);
    flexContainer.appendChild(title);
    flexContainer.appendChild(closeButton);
    innerContainer.appendChild(flexContainer);
    innerContainer.appendChild(progressBar);
    container.appendChild(innerContainer);
  };

  const updateProgress = (videoId, fileName, progress) => {
    const innerContainer = document.getElementById(
      "tel-downloader-progress-" + videoId
    );
    innerContainer.querySelector("p.filename").innerText = fileName;
    const progressBar = innerContainer.querySelector("div.progress");
    progressBar.querySelector("p").innerText = progress + "%";
    progressBar.querySelector("div").style.width = progress + "%";
  };

  const completeProgress = (videoId) => {
    const progressBar = document
      .getElementById("tel-downloader-progress-" + videoId)
      .querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Completed";
    progressBar.querySelector("div").style.backgroundColor = "#B6C649";
    progressBar.querySelector("div").style.width = "100%";
  };

  const AbortProgress = (videoId) => {
    const progressBar = document
      .getElementById("tel-downloader-progress-" + videoId)
      .querySelector("div.progress");
    progressBar.querySelector("p").innerText = "Aborted";
    progressBar.querySelector("div").style.backgroundColor = "#D16666";
    progressBar.querySelector("div").style.width = "100%";
  };

  const tel_download_video = (url) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    let _file_extension = "mp4";

    const videoId =
      (Math.random() + 1).toString(36).substring(2, 10) +
      "_" +
      Date.now().toString();
    let fileName = hashCode(url).toString(36) + "." + _file_extension;

    // Some video src is in format:
    // 'stream/{"dcId":5,"location":{...},"size":...,"mimeType":"video/mp4","fileName":"xxxx.MP4"}'
    try {
      const metadata = JSON.parse(
        decodeURIComponent(url.split("/")[url.split("/").length - 1])
      );
      if (metadata.fileName) {
        fileName = metadata.fileName;
      }
    } catch (e) {
      // Invalid JSON string, pass extracting fileName
    }
    logger.info(`URL: ${url}`, fileName);

    const fetchNextPart = (_writable) => {
      fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${_next_offset}-`,
        },
        "User-Agent":
          "User-Agent Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
      })
        .then((res) => {
          if (![200, 206].includes(res.status)) {
            throw new Error("Non 200/206 response was received: " + res.status);
          }
          const mime = res.headers.get("Content-Type").split(";")[0];
          if (!mime.startsWith("video/")) {
            throw new Error("Get non video response with MIME type " + mime);
          }
          _file_extension = mime.split("/")[1];
          fileName =
            fileName.substring(0, fileName.indexOf(".") + 1) + _file_extension;

          const match = res.headers
            .get("Content-Range")
            .match(contentRangeRegex);

          const startOffset = parseInt(match[1]);
          const endOffset = parseInt(match[2]);
          const totalSize = parseInt(match[3]);

          if (startOffset !== _next_offset) {
            logger.error("Gap detected between responses.", fileName);
            logger.info("Last offset: " + _next_offset, fileName);
            logger.info("New start offset " + match[1], fileName);
            throw "Gap detected between responses.";
          }
          if (_total_size && totalSize !== _total_size) {
            logger.error("Total size differs", fileName);
            throw "Total size differs";
          }

          _next_offset = endOffset + 1;
          _total_size = totalSize;

          logger.info(
            `Get response: ${res.headers.get(
              "Content-Length"
            )} bytes data from ${res.headers.get("Content-Range")}`,
            fileName
          );
          logger.info(
            `Progress: ${((_next_offset * 100) / _total_size).toFixed(0)}%`,
            fileName
          );
          updateProgress(
            videoId,
            fileName,
            ((_next_offset * 100) / _total_size).toFixed(0)
          );
          return res.blob();
        })
        .then((resBlob) => {
          if (_writable !== null) {
            _writable.write(resBlob).then(() => {});
          } else {
            _blobs.push(resBlob);
          }
        })
        .then(() => {
          if (!_total_size) {
            throw new Error("_total_size is NULL");
          }

          if (_next_offset < _total_size) {
            fetchNextPart(_writable);
          } else {
            if (_writable !== null) {
              _writable.close().then(() => {
                logger.info("Download finished", fileName);
              });
            } else {
              save();
            }
            completeProgress(videoId);
          }
        })
        .catch((reason) => {
          logger.error(reason, fileName);
          AbortProgress(videoId);
        });
    };

    const save = () => {
      logger.info("Finish downloading blobs", fileName);
      logger.info("Concatenating blobs and downloading...", fileName);

      const blob = new Blob(_blobs, { type: "video/mp4" });
      const blobUrl = window.URL.createObjectURL(blob);

      logger.info("Final blob size: " + blob.size + " bytes", fileName);

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      logger.info("Download triggered", fileName);
    };

    const supportsFileSystemAccess =
      "showSaveFilePicker" in unsafeWindow &&
      (() => {
        try {
          return unsafeWindow.self === unsafeWindow.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      unsafeWindow
        .showSaveFilePicker({
          suggestedName: fileName,
        })
        .then((handle) => {
          handle
            .createWritable()
            .then((writable) => {
              fetchNextPart(writable);
              createProgressBar(videoId);
            })
            .catch((err) => {
              console.error(err.name, err.message);
            });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error(err.name, err.message);
          }
        });
    } else {
      fetchNextPart(null);
      createProgressBar(videoId);
    }
  };

  const tel_download_audio = (url) => {
    let _blobs = [];
    let _next_offset = 0;
    let _total_size = null;
    const fileName = hashCode(url).toString(36) + ".ogg";

    const fetchNextPart = (_writable) => {
      fetch(url, {
        method: "GET",
        headers: {
          Range: `bytes=${_next_offset}-`,
        },
      })
        .then((res) => {
          if (res.status !== 206 && res.status !== 200) {
            logger.error(
              "Non 200/206 response was received: " + res.status,
              fileName
            );
            return;
          }

          const mime = res.headers.get("Content-Type").split(";")[0];
          if (!mime.startsWith("audio/")) {
            logger.error(
              "Get non audio response with MIME type " + mime,
              fileName
            );
            throw "Get non audio response with MIME type " + mime;
          }

          try {
            const match = res.headers
              .get("Content-Range")
              .match(contentRangeRegex);

            const startOffset = parseInt(match[1]);
            const endOffset = parseInt(match[2]);
            const totalSize = parseInt(match[3]);

            if (startOffset !== _next_offset) {
              logger.error("Gap detected between responses.");
              logger.info("Last offset: " + _next_offset);
              logger.info("New start offset " + match[1]);
              throw "Gap detected between responses.";
            }
            if (_total_size && totalSize !== _total_size) {
              logger.error("Total size differs");
              throw "Total size differs";
            }

            _next_offset = endOffset + 1;
            _total_size = totalSize;
          } finally {
            logger.info(
              `Get response: ${res.headers.get(
                "Content-Length"
              )} bytes data from ${res.headers.get("Content-Range")}`
            );
            return res.blob();
          }
        })
        .then((resBlob) => {
          if (_writable !== null) {
            _writable.write(resBlob).then(() => {});
          } else {
            _blobs.push(resBlob);
          }
        })
        .then(() => {
          if (_next_offset < _total_size) {
            fetchNextPart(_writable);
          } else {
            if (_writable !== null) {
              _writable.close().then(() => {
                logger.info("Download finished", fileName);
              });
            } else {
              save();
            }
          }
        })
        .catch((reason) => {
          logger.error(reason, fileName);
        });
    };

    const save = () => {
      logger.info(
        "Finish downloading blobs. Concatenating blobs and downloading...",
        fileName
      );

      let blob = new Blob(_blobs, { type: "audio/ogg" });
      const blobUrl = window.URL.createObjectURL(blob);

      logger.info("Final blob size in bytes: " + blob.size, fileName);

      blob = 0;

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      logger.info("Download triggered", fileName);
    };

    const supportsFileSystemAccess =
      "showSaveFilePicker" in unsafeWindow &&
      (() => {
        try {
          return unsafeWindow.self === unsafeWindow.top;
        } catch {
          return false;
        }
      })();
    if (supportsFileSystemAccess) {
      unsafeWindow
        .showSaveFilePicker({
          suggestedName: fileName,
        })
        .then((handle) => {
          handle
            .createWritable()
            .then((writable) => {
              fetchNextPart(writable);
            })
            .catch((err) => {
              console.error(err.name, err.message);
            });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error(err.name, err.message);
          }
        });
    } else {
      fetchNextPart(null);
    }
  };

  const tel_download_image = (imageUrl) => {
    const fileName =
      (Math.random() + 1).toString(36).substring(2, 10) + ".jpeg"; // assume jpeg

    const a = document.createElement("a");
    document.body.appendChild(a);
    a.href = imageUrl;
    a.download = fileName;
    a.click();
    document.body.removeChild(a);

    logger.info("Download triggered", fileName);
  };

  // =====================================================
  // Auto-download from t.me link
  // =====================================================

  // Whether to skip non-video media when auto-downloading (can be toggled by UI)
  let _autoDownloadVideoOnly = true;
  const AUTO_DOWNLOAD_MAX_RETRIES = 20;
  const AUTO_DOWNLOAD_RETRY_DELAY = 800;

  /**
   * Parse a t.me message URL.
   * Supports:
   *   https://t.me/SafeASMR/5294          (public channel / username)
   *   https://t.me/c/1234567890/5294      (private channel numeric id)
   * Returns { chat, msgId, isPrivate } or null on failure.
   */
  const parseTmeLink = (rawUrl) => {
    try {
      const url = rawUrl.trim().split("?")[0].split("#")[0];
      // Private channel: https://t.me/c/<channelId>/<postId>
      const privateMatch = url.match(/^https?:\/\/t\.me\/c\/(\d+)\/(\d+)\/?$/);
      if (privateMatch) {
        return { chat: privateMatch[1], msgId: privateMatch[2], isPrivate: true };
      }
      // Public username: https://t.me/<username>/<postId>
      const publicMatch = url.match(
        /^https?:\/\/t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,31})\/(\d+)\/?$/
      );
      if (publicMatch) {
        return { chat: publicMatch[1], msgId: publicMatch[2], isPrivate: false };
      }
    } catch (_e) {
      // ignore parse errors
    }
    return null;
  };

  /**
   * Detect which Telegram webapp is active.
   * Returns 'k' (webk /k/) or 'z' (webz /a/).
   */
  const getWebappType = () => {
    if (
      location.pathname.startsWith("/k/") ||
      location.hostname === "webk.telegram.org"
    )
      return "k";
    if (
      location.pathname.startsWith("/a/") ||
      location.hostname === "webz.telegram.org"
    )
      return "z";
    return "k"; // default to webk
  };

  /**
   * Navigate Telegram Web to a specific message using the tg:// deep-link hash.
   * Works for both webk and webz.
   */
  const navigateToTmeMessage = (chat, msgId, isPrivate) => {
    const tgLink = isPrivate
      ? `tg://privatepost?channel=${encodeURIComponent(chat)}&post=${encodeURIComponent(msgId)}`
      : `tg://resolve?domain=${encodeURIComponent(chat)}&post=${encodeURIComponent(msgId)}`;
    const newHash = "?tgaddr=" + encodeURIComponent(tgLink);
    logger.info(`[AutoDL] Navigating via hash: ${newHash}`);
    location.hash = newHash;
  };

  /**
   * Try to extract a media src from the targeted message bubble after navigation.
   *
   * Strategy:
   *  1. Look for a highlighted/focused bubble (Telegram marks the deep-linked message).
   *  2. Fall back to a bubble with the matching data-mid (webk) or data-message-id (webz).
   *  3. If a video thumbnail is found but video src is not yet loaded, click it to trigger load.
   *
   * Returns { type: 'video'|'image'|'audio', src } or null.
   */
  const extractMediaFromMessage = (msgId, videoOnly) => {
    const webType = getWebappType();

    // Collect candidate bubbles: highlighted first, then by message id
    const candidates = [];
    const highlighted =
      document.querySelector(".bubble.is-highlighted") ||
      document.querySelector(".bubble.focused") ||
      document.querySelector(".message-list-item.is-selected");
    if (highlighted) candidates.push(highlighted);

    if (webType === "k") {
      const byMid = document.querySelector(`.bubble[data-mid="${msgId}"]`);
      if (byMid && !candidates.includes(byMid)) candidates.push(byMid);
    } else {
      const byMsgId =
        document.querySelector(`[data-message-id="${msgId}"]`) ||
        document.querySelector(`div[id$="_${msgId}"]`) ||
        document.querySelector(`div[id$="-${msgId}"]`);
      if (byMsgId && !candidates.includes(byMsgId)) candidates.push(byMsgId);
    }

    for (const bubble of candidates) {
      // Try video
      const video = bubble.querySelector("video");
      if (video) {
        const src =
          video.currentSrc ||
          video.src ||
          video.querySelector("source")?.src;
        if (src) return { type: "video", src };
      }

      // Video thumbnail present but not yet loaded -- click to trigger load
      if (!videoOnly) {
        const thumb = bubble.querySelector(".video-thumb");
        if (thumb) thumb.click();
      }

      if (videoOnly) continue;

      // Try image
      const img =
        bubble.querySelector("img.media-photo") ||
        bubble.querySelector("img.thumbnail") ||
        bubble.querySelector(".photo img");
      if (img && img.src) return { type: "image", src: img.src };

      // Try audio
      const audio = bubble.querySelector("audio");
      if (audio) {
        const src =
          audio.currentSrc ||
          audio.src ||
          audio.querySelector("source")?.src;
        if (src) return { type: "audio", src };
      }
    }

    return null;
  };

  /**
   * Main auto-download orchestrator.
   * Parses the t.me URL, navigates to the message, and polls for media.
   *
   * @param {string}   tmeUrl    Full https://t.me/… link
   * @param {Function} onStatus  Called with a progress string on each poll
   * @param {Function} onDone    Called with (success: boolean, message: string) when finished
   */
  const autoDownloadFromLink = (tmeUrl, onStatus, onDone) => {
    const parsed = parseTmeLink(tmeUrl);
    if (!parsed) {
      onDone(
        false,
        "Invalid link -- expected: https://t.me/channel/msgId  or  https://t.me/c/channelId/msgId"
      );
      return;
    }

    const { chat, msgId, isPrivate } = parsed;
    logger.info(
      `[AutoDL] chat=${chat} msgId=${msgId} isPrivate=${isPrivate}`
    );
    onStatus(`Navigating to ${chat}/${msgId}…`);
    navigateToTmeMessage(chat, msgId, isPrivate);

    let retries = 0;
    const poll = () => {
      retries++;
      const media = extractMediaFromMessage(msgId, _autoDownloadVideoOnly);
      if (media) {
        onStatus(`Found ${media.type} — starting download…`);
        logger.info(`[AutoDL] Downloading ${media.type}: ${media.src}`);
        if (media.type === "video") tel_download_video(media.src);
        else if (media.type === "image") tel_download_image(media.src);
        else if (media.type === "audio") tel_download_audio(media.src);
        onDone(true, `✓ Download started (${media.type})`);
        return;
      }

      if (retries >= AUTO_DOWNLOAD_MAX_RETRIES) {
        const msg = _autoDownloadVideoOnly
          ? "No video found -- check the link and your channel access, or disable 'Video only'."
          : "No media found -- check the link and your channel access.";
        onDone(false, msg);
        return;
      }

      onStatus(
        `Waiting for message to load… (${retries}/${AUTO_DOWNLOAD_MAX_RETRIES})`
      );
      setTimeout(poll, AUTO_DOWNLOAD_RETRY_DELAY);
    };

    // Give navigation a moment before starting to poll
    setTimeout(poll, AUTO_DOWNLOAD_RETRY_DELAY);
  };

  /**
   * Create and inject the Auto-Download UI:
   *  - A floating action button (FAB) in the bottom-left corner
   *  - A centered modal dialog with:
   *      • t.me link input
   *      • "Video only" checkbox
   *      • Download / Close buttons
   *      • Live status text
   */
  const setupAutoDownloadUI = () => {
    const isDark = () =>
      document.documentElement.classList.contains("night") ||
      document.documentElement.classList.contains("theme-dark");

    // ---- Dialog ----
    const dialog = document.createElement("div");
    dialog.id = "tel-auto-dl-dialog";
    dialog.style.cssText = [
      "display:none",
      "position:fixed",
      "top:50%",
      "left:50%",
      "transform:translate(-50%,-50%)",
      "border-radius:12px",
      "box-shadow:0 4px 32px rgba(0,0,0,.45)",
      "padding:20px 22px",
      "z-index:99999",
      "width:400px",
      "max-width:calc(100vw - 32px)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    ].join(";");

    // Dynamic theming (applied each time dialog is opened)
    const applyTheme = () => {
      const dark = isDark();
      dialog.style.background = dark ? "#2b2b2b" : "#ffffff";
      dialog.style.color = dark ? "#e8e8e8" : "#1a1a1a";
      input.style.background = dark ? "#3a3a3a" : "#f5f5f5";
      input.style.color = dark ? "#e8e8e8" : "#1a1a1a";
      input.style.borderColor = dark ? "#555" : "#ccc";
      closeBtn.style.borderColor = dark ? "#555" : "#ccc";
      closeBtn.style.color = dark ? "#aaa" : "#555";
    };

    // Title bar
    const titleBar = document.createElement("div");
    titleBar.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;";

    const titleText = document.createElement("span");
    titleText.textContent = "⬇  Auto-Download from Link";
    titleText.style.cssText = "font-size:15px;font-weight:600;";

    const xBtn = document.createElement("span");
    xBtn.textContent = "✕";
    xBtn.style.cssText = "cursor:pointer;font-size:16px;opacity:0.55;";
    xBtn.onclick = () => {
      dialog.style.display = "none";
    };
    titleBar.appendChild(titleText);
    titleBar.appendChild(xBtn);

    // URL input
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "https://t.me/channel/12345";
    input.style.cssText = [
      "width:100%",
      "box-sizing:border-box",
      "padding:9px 11px",
      "border:1px solid #ccc",
      "border-radius:7px",
      "font-size:14px",
      "margin-bottom:10px",
      "outline:none",
    ].join(";");

    // Video-only toggle
    const toggleLabel = document.createElement("label");
    toggleLabel.style.cssText =
      "display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:13px;cursor:pointer;user-select:none;";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = _autoDownloadVideoOnly;
    checkbox.style.cssText = "width:14px;height:14px;cursor:pointer;";
    checkbox.onchange = () => {
      _autoDownloadVideoOnly = checkbox.checked;
    };
    const toggleText = document.createElement("span");
    toggleText.textContent = "Video only (skip images / GIFs / audio)";
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(toggleText);

    // Action buttons row
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;";

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download";
    downloadBtn.style.cssText = [
      "flex:1",
      "padding:9px",
      "background:#2196f3",
      "color:#fff",
      "border:none",
      "border-radius:7px",
      "font-size:14px",
      "cursor:pointer",
      "font-weight:500",
    ].join(";");

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = [
      "padding:9px 16px",
      "background:transparent",
      "border:1px solid #ccc",
      "border-radius:7px",
      "font-size:14px",
      "cursor:pointer",
    ].join(";");
    closeBtn.onclick = () => {
      dialog.style.display = "none";
    };

    btnRow.appendChild(downloadBtn);
    btnRow.appendChild(closeBtn);

    // Status / error text
    const statusEl = document.createElement("div");
    statusEl.style.cssText =
      "margin-top:11px;font-size:13px;min-height:18px;word-break:break-word;";

    // Download button handler
    downloadBtn.onclick = () => {
      const url = input.value.trim();
      if (!url) {
        statusEl.style.color = "#e53935";
        statusEl.textContent = "Please enter a t.me link.";
        return;
      }
      downloadBtn.disabled = true;
      downloadBtn.style.opacity = "0.6";
      statusEl.style.color = "";
      statusEl.textContent = "";
      autoDownloadFromLink(
        url,
        (msg) => {
          statusEl.textContent = msg;
        },
        (success, msg) => {
          downloadBtn.disabled = false;
          downloadBtn.style.opacity = "1";
          statusEl.style.color = success ? "#43a047" : "#e53935";
          statusEl.textContent = msg;
          if (success) {
            setTimeout(() => {
              dialog.style.display = "none";
            }, 2000);
          }
        }
      );
    };

    // Allow pressing Enter to submit
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") downloadBtn.click();
    });

    dialog.appendChild(titleBar);
    dialog.appendChild(input);
    dialog.appendChild(toggleLabel);
    dialog.appendChild(btnRow);
    dialog.appendChild(statusEl);
    document.body.appendChild(dialog);

    // ---- Floating action button ----
    const fab = document.createElement("button");
    fab.id = "tel-auto-dl-fab";
    fab.title = "Auto-download from t.me link";
    fab.textContent = "⬇ Auto DL";
    fab.style.cssText = [
      "position:fixed",
      "bottom:62px",
      "left:12px",
      "z-index:99998",
      "background:#2196f3",
      "color:#fff",
      "border:none",
      "border-radius:20px",
      "padding:7px 13px",
      "font-size:13px",
      "cursor:pointer",
      "box-shadow:0 2px 10px rgba(0,0,0,.35)",
      "opacity:0.85",
      "transition:opacity .15s",
    ].join(";");
    fab.onmouseenter = () => {
      fab.style.opacity = "1";
    };
    fab.onmouseleave = () => {
      fab.style.opacity = "0.85";
    };
    fab.onclick = () => {
      applyTheme();
      const isVisible = dialog.style.display !== "none";
      dialog.style.display = isVisible ? "none" : "block";
      if (!isVisible) input.focus();
    };

    document.body.appendChild(fab);
  };

  logger.info("Initialized");

  // For webz /a/ webapp
  setInterval(() => {
    // Stories
    const storiesContainer = document.getElementById("StoryViewer");
    if (storiesContainer) {
      console.log("storiesContainer");
      const createDownloadButton = () => {
        console.log("createDownloadButton");
        const downloadIcon = document.createElement("i");
        downloadIcon.className = "icon icon-download";
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "Button TkphaPyQ tiny translucent-white round tel-download";
        downloadButton.appendChild(downloadIcon);
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = () => {
          // 1. Story with video
          const video = storiesContainer.querySelector("video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
            // 2. Story with image
            const images = storiesContainer.querySelectorAll("img.PVZ8TOWS");
            if (images.length > 0) {
              const imageSrc = images[images.length - 1]?.src;
              if (imageSrc) tel_download_image(imageSrc);
            }
          }
        };
        return downloadButton;
      };

      const storyHeader =
        storiesContainer.querySelector(".GrsJNw3y") ||
        storiesContainer.querySelector(".DropdownMenu").parentNode;
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        console.log("storyHeader");
        storyHeader.insertBefore(
          createDownloadButton(),
          storyHeader.querySelector("button")
        );
      }
    }

    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector(
      "#MediaViewer .MediaViewerSlide--active"
    );
    const mediaViewerActions = document.querySelector(
      "#MediaViewer .MediaViewerActions"
    );
    if (!mediaContainer || !mediaViewerActions) return;

    // Videos in channels
    const videoPlayer = mediaContainer.querySelector(
      ".MediaViewerContent > .VideoPlayer"
    );
    const img = mediaContainer.querySelector(".MediaViewerContent > div > img");
    // 1. Video player detected - Video or GIF
    // container > .MediaViewerSlides > .MediaViewerSlide > .MediaViewerContent > .VideoPlayer > video[src]
    const downloadIcon = document.createElement("i");
    downloadIcon.className = "icon icon-download";
    const downloadButton = document.createElement("button");
    downloadButton.className =
      "Button smaller translucent-white round tel-download";
    downloadButton.setAttribute("type", "button");
    downloadButton.setAttribute("title", "Download");
    downloadButton.setAttribute("aria-label", "Download");
    if (videoPlayer) {
      const videoUrl = videoPlayer.querySelector("video").currentSrc;
      downloadButton.setAttribute("data-tel-download-url", videoUrl);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        tel_download_video(videoPlayer.querySelector("video").currentSrc);
      };

      // Add download button to video controls
      const controls = videoPlayer.querySelector(".VideoPlayerControls");
      if (controls) {
        const buttons = controls.querySelector(".buttons");
        if (!buttons.querySelector("button.tel-download")) {
          const spacer = buttons.querySelector(".spacer");
          spacer.after(downloadButton);
        }
      }

      // Add/Update/Remove download button to topbar
      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          // There's existing download button, remove ours
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== videoUrl
        ) {
          // Update existing button
          telDownloadButton.onclick = () => {
            tel_download_video(videoPlayer.querySelector("video").currentSrc);
          };
          telDownloadButton.setAttribute("data-tel-download-url", videoUrl);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        // Add the button if there's no download button at all
        mediaViewerActions.prepend(downloadButton);
      }
    } else if (img && img.src) {
      downloadButton.setAttribute("data-tel-download-url", img.src);
      downloadButton.appendChild(downloadIcon);
      downloadButton.onclick = () => {
        tel_download_image(img.src);
      };

      // Add/Update/Remove download button to topbar
      if (mediaViewerActions.querySelector("button.tel-download")) {
        const telDownloadButton = mediaViewerActions.querySelector(
          "button.tel-download"
        );
        if (
          mediaViewerActions.querySelectorAll('button[title="Download"]')
            .length > 1
        ) {
          // There's existing download button, remove ours
          mediaViewerActions.querySelector("button.tel-download").remove();
        } else if (
          telDownloadButton.getAttribute("data-tel-download-url") !== img.src
        ) {
          // Update existing button
          telDownloadButton.onclick = () => {
            tel_download_image(img.src);
          };
          telDownloadButton.setAttribute("data-tel-download-url", img.src);
        }
      } else if (
        !mediaViewerActions.querySelector('button[title="Download"]')
      ) {
        // Add the button if there's no download button at all
        mediaViewerActions.prepend(downloadButton);
      }
    }
  }, REFRESH_DELAY);

  // For webk /k/ webapp
  setInterval(() => {
    /* Voice Message or Circle Video */
    const pinnedAudio = document.body.querySelector(".pinned-audio");
    let dataMid;
    let downloadButtonPinnedAudio =
      document.body.querySelector("._tel_download_button_pinned_container") ||
      document.createElement("button");
    if (pinnedAudio) {
      dataMid = pinnedAudio.getAttribute("data-mid");
      downloadButtonPinnedAudio.className =
        "btn-icon tgico-download _tel_download_button_pinned_container";
      downloadButtonPinnedAudio.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
    }
    const audioElements = document.body.querySelectorAll("audio-element");
    audioElements.forEach((audioElement) => {
      const bubble = audioElement.closest(".bubble");
      if (
        !bubble ||
        bubble.querySelector("._tel_download_button_pinned_container")
      ) {
        return; /* Skip if there's already a download button */
      }
      if (
        dataMid &&
        downloadButtonPinnedAudio.getAttribute("data-mid") !== dataMid &&
        audioElement.getAttribute("data-mid") === dataMid
      ) {
        downloadButtonPinnedAudio.onclick = (e) => {
          e.stopPropagation();
          if (isAudio) {
              tel_download_audio(link);
          } else {
              tel_download_video(link);
          }
        };
        downloadButtonPinnedAudio.setAttribute("data-mid", dataMid);
        const link = audioElement.audio && audioElement.audio.getAttribute("src");
        const isAudio = audioElement.audio && audioElement.audio instanceof HTMLAudioElement
        if (link) {
          pinnedAudio
            .querySelector(".pinned-container-wrapper-utils")
            .appendChild(downloadButtonPinnedAudio);
        }
      }
    });

    // Stories
    const storiesContainer = document.getElementById("stories-viewer");
    if (storiesContainer) {
      const createDownloadButton = () => {
        const downloadButton = document.createElement("button");
        downloadButton.className = "btn-icon rp tel-download";
        downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span><div class="c-ripple"></div>`;
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        downloadButton.onclick = () => {
          // 1. Story with video
          const video = storiesContainer.querySelector("video.media-video");
          const videoSrc =
            video?.src ||
            video?.currentSrc ||
            video?.querySelector("source")?.src;
          if (videoSrc) {
            tel_download_video(videoSrc);
          } else {
            // 2. Story with image
            const imageSrc =
              storiesContainer.querySelector("img.media-photo")?.src;
            if (imageSrc) tel_download_image(imageSrc);
          }
        };
        return downloadButton;
      };

      const storyHeader = storiesContainer.querySelector(
        "[class^='_ViewerStoryHeaderRight']"
      );
      if (storyHeader && !storyHeader.querySelector(".tel-download")) {
        storyHeader.prepend(createDownloadButton());
      }

      const storyFooter = storiesContainer.querySelector(
        "[class^='_ViewerStoryFooterRight']"
      );
      if (storyFooter && !storyFooter.querySelector(".tel-download")) {
        storyFooter.prepend(createDownloadButton());
      }
    }

    // All media opened are located in .media-viewer-movers > .media-viewer-aspecter
    const mediaContainer = document.querySelector(".media-viewer-whole");
    if (!mediaContainer) return;
    const mediaAspecter = mediaContainer.querySelector(
      ".media-viewer-movers .media-viewer-aspecter"
    );
    const mediaButtons = mediaContainer.querySelector(
      ".media-viewer-topbar .media-viewer-buttons"
    );
    if (!mediaAspecter || !mediaButtons) return;

    // Query hidden buttons and unhide them
    const hiddenButtons = mediaButtons.querySelectorAll("button.btn-icon.hide");
    let onDownload = null;
    for (const btn of hiddenButtons) {
      btn.classList.remove("hide");
      if (btn.textContent === FORWARD_ICON) {
        btn.classList.add("tgico-forward");
      }
      if (btn.textContent === DOWNLOAD_ICON) {
        btn.classList.add("tgico-download");
        // Use official download buttons
        onDownload = () => {
          btn.click();
        };
        logger.info("onDownload", onDownload);
      }
    }

    if (mediaAspecter.querySelector(".ckin__player")) {
      // 1. Video player detected - Video and it has finished initial loading
      // container > .ckin__player > video[src]

      // add download button to videos
      const controls = mediaAspecter.querySelector(
        ".default__controls.ckin__controls"
      );
      if (controls && !controls.querySelector(".tel-download")) {
        const brControls = controls.querySelector(
          ".bottom-controls .right-controls"
        );
        const downloadButton = document.createElement("button");
        downloadButton.className =
          "btn-icon default__button tgico-download tel-download";
        downloadButton.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`;
        downloadButton.setAttribute("type", "button");
        downloadButton.setAttribute("title", "Download");
        downloadButton.setAttribute("aria-label", "Download");
        if (onDownload) {
          downloadButton.onclick = onDownload;
        } else {
          downloadButton.onclick = () => {
            tel_download_video(mediaAspecter.querySelector("video").src);
          };
        }
        brControls.prepend(downloadButton);
      }
    } else if (
      mediaAspecter.querySelector("video") &&
      mediaAspecter.querySelector("video") &&
      !mediaButtons.querySelector("button.btn-icon.tgico-download")
    ) {
      // 2. Video HTML element detected, could be either GIF or unloaded video
      // container > video[src]
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      if (onDownload) {
        downloadButton.onclick = onDownload;
      } else {
        downloadButton.onclick = () => {
          tel_download_video(mediaAspecter.querySelector("video").src);
        };
      }
      mediaButtons.prepend(downloadButton);
    } else if (!mediaButtons.querySelector("button.btn-icon.tgico-download")) {
      // 3. Image without download button detected
      // container > img.thumbnail
      if (
        !mediaAspecter.querySelector("img.thumbnail") ||
        !mediaAspecter.querySelector("img.thumbnail").src
      ) {
        return;
      }
      const downloadButton = document.createElement("button");
      downloadButton.className = "btn-icon tgico-download tel-download";
      downloadButton.innerHTML = `<span class="tgico button-icon">${DOWNLOAD_ICON}</span>`;
      downloadButton.setAttribute("type", "button");
      downloadButton.setAttribute("title", "Download");
      downloadButton.setAttribute("aria-label", "Download");
      if (onDownload) {
        downloadButton.onclick = onDownload;
      } else {
        downloadButton.onclick = () => {
          tel_download_image(mediaAspecter.querySelector("img.thumbnail").src);
        };
      }
      mediaButtons.prepend(downloadButton);
    }
  }, REFRESH_DELAY);

  // Progress bar container setup
  (function setupProgressBar() {
    const body = document.querySelector("body");
    const container = document.createElement("div");
    container.id = "tel-downloader-progress-bar-container";
    container.style.position = "fixed";
    container.style.bottom = 0;
    container.style.right = 0;
    if (location.pathname.startsWith("/k/")) {
      container.style.zIndex = 4;
    } else {
      container.style.zIndex = 1600;
    }
    body.appendChild(container);
  })();

  setupAutoDownloadUI();

  logger.info("Completed script setup.");
})();
