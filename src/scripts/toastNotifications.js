class ToastNotifications {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.maxToasts = 5;
    this.defaultDuration = 4000;
    this.init();
  }

  init() {
    this.createContainer();
    this.injectStyles();
  }

  createContainer() {
    this.container = document.createElement("div");
    this.container.id = "toast-container";
    this.container.className = "toast-container";
    document.body.appendChild(this.container);
  }

  injectStyles() {
    const styles = document.createElement("style");
    styles.textContent = `
            .toast-container {
                position: fixed;
                top: 0.75rem;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                align-items: center;
                pointer-events: none;
                width: 420px;
                max-width: calc(100vw - 2rem);
            }

            @media (max-width: 640px) {
                .toast-container {
                    top: 0.5rem;
                }
            }

            .toast {
                position: absolute;
                top: 0;
                width: 100%;
                background: rgba(26, 10, 15, 1);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 1.25rem;
                padding: 1rem 1.25rem;
                display: flex;
                align-items: center;
                gap: 1rem;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                            0 0 0 1px rgba(255, 255, 255, 0.05);
                pointer-events: auto;
                opacity: 0;
                transform: translateY(-20px) scale(0.9);
                transition: transform 0.6s cubic-bezier(0.2, 1, 0.2, 1),
                            opacity 0.5s cubic-bezier(0.2, 1, 0.2, 1);
                min-height: 64px;
                transform-origin: top center;
                will-change: transform, opacity;
            }

            .toast.show {
                opacity: 1;
            }

            .toast.hide {
                opacity: 0 !important;
                transform: translateY(-20px) scale(0.85) !important;
                pointer-events: none;
            }

            .toast-icon {
                width: 42px;
                height: 42px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                background: rgba(255, 255, 255, 0.05);
            }

            .toast-icon .material-symbols-rounded {
                font-size: 24px;
            }

            .toast-success .toast-icon {
                background: rgba(34, 197, 94, 0.15);
                color: #4ade80;
            }

            .toast-error .toast-icon {
                background: rgba(239, 68, 68, 0.15);
                color: #f87171;
            }

            .toast-info .toast-icon {
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
            }

            .toast-warning .toast-icon {
                background: rgba(245, 158, 11, 0.15);
                color: #fbbf24;
            }

            .toast-content {
                flex: 1;
                min-width: 0;
            }

            .toast-title {
                color: #fff;
                font-weight: 700;
                font-size: 0.95rem;
                margin: 0 0 0.2rem 0;
                line-height: 1.2;
            }

            .toast-message {
                color: rgba(255, 255, 255, 0.8);
                font-size: 0.875rem;
                margin: 0;
                line-height: 1.4;
                word-wrap: break-word;
            }

            .toast-close {
                width: 32px;
                height: 32px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.05);
                border: none;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
                padding: 0;
            }

            .toast-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                transform: scale(1.05);
            }

            .toast-close .material-symbols-rounded {
                font-size: 20px;
            }

            .toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: var(--primary-color, #800020);
                border-radius: 0 0 0 1.25rem;
                opacity: 0.6;
            }

            .toast-success .toast-progress { background: #4ade80; }
            .toast-error .toast-progress { background: #f87171; }
            .toast-info .toast-progress { background: #60a5fa; }
            .toast-warning .toast-progress { background: #fbbf24; }
        `;
    document.head.appendChild(styles);
  }

  show(message, type = "info", options = {}) {
    const {
      duration = this.defaultDuration,
      title = null,
      useI18n = true,
      i18nParams = {},
    } = options;

    if (this.toasts.length >= this.maxToasts) {
      this.remove(this.toasts[0]);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.style.overflow = "hidden";

    const iconMap = {
      success: "check_circle",
      error: "error",
      info: "info",
      warning: "warning",
    };

    let displayMessage = message;
    let displayTitle = title;

    if (useI18n && window.t) {
      displayMessage = window.t(message, i18nParams) || message;
      if (title) {
        displayTitle = window.t(title, i18nParams) || title;
      }
    }

    const iconHtml = `<div class="toast-icon"><span translate="no" class="material-symbols-rounded">${iconMap[type]}</span></div>`;
    const titleHtml = displayTitle
      ? `<h4 class="toast-title">${this.escapeHtml(displayTitle)}</h4>`
      : "";
    const messageHtml = `<p class="toast-message">${this.escapeHtml(displayMessage)}</p>`;
    const closeHtml = `<button class="toast-close" aria-label="Close"><span translate="no" class="material-symbols-rounded">close</span></button>`;
    toast.innerHTML = `${iconHtml}<div class="toast-content">${titleHtml}${messageHtml}</div>${closeHtml}`;

    const progress = document.createElement("div");
    progress.className = "toast-progress";
    progress.style.width = "100%";
    toast.appendChild(progress);

    this.container.appendChild(toast);
    this.toasts.push(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
      this.updateStack();
    });

    setTimeout(() => {
      progress.style.transition = `width ${duration}ms linear`;
      progress.style.width = "0%";
    }, 50);

    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.addEventListener("click", () => this.remove(toast));

    const autoRemoveTimeout = setTimeout(() => {
      this.remove(toast);
    }, duration);

    toast._timeout = autoRemoveTimeout;
    return toast;
  }

  updateStack() {
    const total = this.toasts.length;
    this.toasts.forEach((toast, index) => {
      const reverseIndex = total - 1 - index;
      const offset = reverseIndex * 12;
      const scale = 1 - reverseIndex * 0.05;
      const zIndex = 1000 - reverseIndex;

      if (toast.classList.contains("hide")) return;
      toast.style.zIndex = zIndex;
      toast.style.transform = `translateY(${offset}px) scale(${scale})`;

      if (reverseIndex >= 3) {
        toast.style.opacity = "0";
        toast.style.pointerEvents = "none";
      } else {
        toast.style.opacity =
          reverseIndex === 0 ? "1" : (1 - reverseIndex * 0.2).toString();
        toast.style.pointerEvents = "auto";
      }
    });
  }

  success(message, options = {}) {
    return this.show(message, "success", options);
  }

  error(message, options = {}) {
    return this.show(message, "error", { duration: 5000, ...options });
  }

  info(message, options = {}) {
    return this.show(message, "info", options);
  }

  warning(message, options = {}) {
    return this.show(message, "warning", { duration: 4000, ...options });
  }

  remove(toast) {
    if (!toast || toast._isRemoving) return;
    toast._isRemoving = true;

    if (toast._timeout) {
      clearTimeout(toast._timeout);
    }

    toast.classList.remove("show");
    toast.classList.add("hide");

    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }
    this.updateStack();

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 600);
  }

  clear() {
    [...this.toasts].forEach((toast) => this.remove(toast));
  }

  escapeHtml(text) {
    if (typeof text !== "string") return text;
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

let notifications;
document.addEventListener("DOMContentLoaded", () => {
  notifications = new ToastNotifications();
  window.notifications = notifications;
});

window.ToastNotifications = ToastNotifications;

window.showToast = function (
  message,
  type = "info",
  duration = null,
  options = {},
) {
  if (window.notifications) {
    let notifOptions = { ...options };
    if (duration) notifOptions.duration = duration;

    switch (type) {
      case "success":
        window.notifications.success(message, notifOptions);
        break;
      case "error":
        window.notifications.error(message, notifOptions);
        break;
      case "warning":
        window.notifications.warning(message, notifOptions);
        break;
      default:
        window.notifications.info(message, notifOptions);
        break;
    }
  }
};

function melechConfirm(message, title = null, options = {}) {
  const {
    confirmText = "playlist.confirm",
    cancelText = "playlist.cancel",
    confirmClass = "",
    useI18n = true,
    i18nParams = {},
  } = options;

  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const backdrop = document.getElementById("confirmModalBackdrop");
    const titleEl = document.getElementById("confirmModalTitle");
    const messageEl = document.getElementById("confirmModalMessage");
    const confirmBtn = document.getElementById("confirmModalConfirm");
    const cancelBtn = document.getElementById("confirmModalCancel");

    if (!modal || !confirmBtn || !cancelBtn) {
      const fallbackMsg =
        useI18n && window.t ? window.t(message, i18nParams) : message;
      resolve(confirm(fallbackMsg));
      return;
    }

    let displayMessage = message;
    let displayTitle = title;
    let displayConfirmText = confirmText;
    let displayCancelText = cancelText;

    if (useI18n && window.t) {
      displayMessage = window.t(message, i18nParams) || message;
      if (title) displayTitle = window.t(title, i18nParams) || title;
      displayConfirmText = window.t(confirmText) || confirmText;
      displayCancelText = window.t(cancelText) || cancelText;
    }

    messageEl.textContent = displayMessage;
    titleEl.textContent =
      displayTitle ||
      (useI18n && window.t ? window.t("common.confirm") : "Confirm");
    confirmBtn.textContent = displayConfirmText;
    cancelBtn.textContent = displayCancelText;

    if (confirmClass) {
      confirmBtn.className = `flex-1 py-3 px-4 text-white rounded-xl transition-all ${confirmClass}`;
    } else {
      confirmBtn.className =
        "flex-1 py-3 px-4 bg-[var(--primary-color)] hover:bg-[var(--secondary-color)] text-white rounded-xl transition-all";
    }

    const content = modal.querySelector(".transform");
    modal.classList.remove("opacity-0", "pointer-events-none");
    modal.classList.add("opacity-100", "pointer-events-auto");
    if (content) {
      content.classList.remove("scale-95");
      content.classList.add("scale-100");
    }

    const handleConfirm = () => {
      hideModal();
      resolve(true);
    };

    const handleCancel = () => {
      hideModal();
      resolve(false);
    };

    const hideModal = () => {
      modal.classList.remove("opacity-100", "pointer-events-auto");
      modal.classList.add("opacity-0", "pointer-events-none");
      if (content) {
        content.classList.remove("scale-100");
        content.classList.add("scale-95");
      }
      confirmBtn.removeEventListener("click", handleConfirm);
      cancelBtn.removeEventListener("click", handleCancel);
      backdrop.removeEventListener("click", handleCancel);
      document.removeEventListener("keydown", handleKeydown);
    };

    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };

    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    backdrop.addEventListener("click", handleCancel);
    document.addEventListener("keydown", handleKeydown);
  });
}

window.melechConfirm = melechConfirm;
