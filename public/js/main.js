/**
 * VITA ERP - JavaScript Principal
 */
document.addEventListener('DOMContentLoaded', function () {
  // ============================================================
  // SIDEBAR DRAWER
  // ============================================================
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const navbarToggle =
    document.getElementById('navbarSidebarToggle') ||
    document.getElementById('sidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');

  // Start collapsed (drawer hidden)
  if (!document.body.classList.contains('sidebar-collapsed')) {
    document.body.classList.add('sidebar-collapsed');
  }

  let lockedScrollY = 0;

  const scrollContainer =
    document.querySelector('.content-wrapper') ||
    document.querySelector('main') ||
    document.documentElement;

  function openSidebar() {
    lockedScrollY = scrollContainer ? scrollContainer.scrollTop : 0;

    if (sidebar) sidebar.classList.add('show');
    if (sidebarOverlay) sidebarOverlay.classList.add('show');

    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('show');
    if (sidebarOverlay) sidebarOverlay.classList.remove('show');

    document.body.classList.remove('sidebar-open');

    if (scrollContainer) {
      scrollContainer.scrollTop = lockedScrollY;
    }
  }

  // ============================================================
  // MOBILE SWIPE FOR SIDEBAR + PULL TO REFRESH CUSTOM
  // ============================================================
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let touchCurrentY = 0;
  let startScrollY = 0;
  let isTrackingSwipe = false;
  let isVerticalScroll = false;
  let isPullingToRefresh = false;

  const MIN_SWIPE = 90;
  const VERTICAL_TOLERANCE = 45;
  const HORIZONTAL_RATIO = 1.5;
  const PULL_REFRESH_THRESHOLD = 80;

  let pullRefreshEl = document.querySelector('.mobile-pull-refresh');
  if (!pullRefreshEl) {
    pullRefreshEl = document.createElement('div');
    pullRefreshEl.className = 'mobile-pull-refresh';
    pullRefreshEl.textContent = 'Desliza para recargar';
    document.body.appendChild(pullRefreshEl);
  }

  function isInteractiveElement(target) {
    return !!target.closest(
      'input, textarea, select, button, a, [contenteditable="true"], .modal, .dropdown-menu'
    );
  }

  function resetPullRefresh() {
    isPullingToRefresh = false;
    pullRefreshEl.classList.remove('show', 'ready');
    pullRefreshEl.textContent = 'Desliza para recargar';
  }

  document.addEventListener(
    'touchstart',
    function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      if (window.innerWidth >= 992) return;

      const target = e.target;
      if (isInteractiveElement(target)) {
        isTrackingSwipe = false;
        isPullingToRefresh = false;
        return;
      }

      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      touchCurrentX = touchStartX;
      touchCurrentY = touchStartY;
      startScrollY = scrollContainer ? scrollContainer.scrollTop : 0;
      isVerticalScroll = false;
      isTrackingSwipe = true;

      isPullingToRefresh = !!(
        scrollContainer &&
        scrollContainer.scrollTop <= 0 &&
        touchStartY <= 140
      );

      if (isPullingToRefresh) {
        pullRefreshEl.classList.add('show');
        pullRefreshEl.classList.remove('ready');
        pullRefreshEl.textContent = 'Desliza para recargar';
      }
    },
    { passive: true }
  );

  document.addEventListener(
    'touchmove',
    function (e) {
      if (!isTrackingSwipe || !e.changedTouches || !e.changedTouches.length) return;

      touchCurrentX = e.changedTouches[0].clientX;
      touchCurrentY = e.changedTouches[0].clientY;

      const diffX = Math.abs(touchCurrentX - touchStartX);
      const diffY = Math.abs(touchCurrentY - touchStartY);

      if (diffY > 12 && diffY > diffX) {
        isVerticalScroll = true;
      }

      if (isPullingToRefresh) {
        const pullDistance = touchCurrentY - touchStartY;

        if (pullDistance > 0) {
          pullRefreshEl.classList.add('show');

          if (pullDistance >= PULL_REFRESH_THRESHOLD) {
            pullRefreshEl.classList.add('ready');
            pullRefreshEl.textContent = 'Suelta para recargar';
          } else {
            pullRefreshEl.classList.remove('ready');
            pullRefreshEl.textContent = 'Desliza para recargar';
          }
        } else {
          resetPullRefresh();
        }
      }
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    function (e) {
      if (!isTrackingSwipe || !e.changedTouches || !e.changedTouches.length) return;
      if (window.innerWidth >= 992) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const diffX = touchEndX - touchStartX;
      const absX = Math.abs(diffX);
      const absY = Math.abs(touchEndY - touchStartY);
      const scrollMoved = Math.abs(
        (scrollContainer ? scrollContainer.scrollTop : 0) - startScrollY
      );
      const isOpen = sidebar && sidebar.classList.contains('show');
      const pullDistance = touchEndY - touchStartY;

      isTrackingSwipe = false;

      // Pull to refresh custom
      if (isPullingToRefresh) {
        if (pullDistance >= PULL_REFRESH_THRESHOLD) {
          pullRefreshEl.classList.add('show');
          pullRefreshEl.classList.remove('ready');
          pullRefreshEl.textContent = 'Recargando...';
          window.location.reload();
          return;
        }

        resetPullRefresh();
        return;
      }

      // Swipe lateral sidebar
      if (isVerticalScroll) return;
      if (scrollMoved > 8) return;
      if (absY > VERTICAL_TOLERANCE) return;
      if (absX < MIN_SWIPE) return;
      if (absX <= absY * HORIZONTAL_RATIO) return;

      if (!isOpen && diffX > 0) {
        openSidebar();
        return;
      }

      if (isOpen && diffX < 0) {
        closeSidebar();
      }
    },
    { passive: true }
  );

  if (navbarToggle) {
    navbarToggle.addEventListener('click', function () {
      const isOpen = sidebar && sidebar.classList.contains('show');
      if (isOpen) closeSidebar();
      else openSidebar();
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);

    sidebarOverlay.addEventListener(
      'touchmove',
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );
  }

  document.addEventListener(
    'touchmove',
    function (e) {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (!sidebar) return;
      if (sidebar.contains(e.target)) return;
      if (sidebarOverlay && sidebarOverlay.contains(e.target)) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('show')) {
      closeSidebar();
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth >= 992) {
      closeSidebar();
    }
  });

  // ============================================================
  // SIDEBAR SUBMENUS
  // ============================================================
  const submenuToggles = document.querySelectorAll('.submenu-toggle');
  submenuToggles.forEach(function (toggle) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      const parent = this.closest('.nav-item');
      if (!parent) return;

      const submenu = parent.querySelector('.sidebar-submenu');
      const arrow = this.querySelector('.submenu-arrow');

      if (submenu) {
        submenu.classList.toggle('show');
        if (arrow) {
          arrow.style.transform = submenu.classList.contains('show')
            ? 'rotate(180deg)'
            : 'rotate(0deg)';
        }
      }
    });
  });

  document.querySelectorAll('.sidebar-submenu.show').forEach(function (submenu) {
    const arrow = submenu.previousElementSibling
      ? submenu.previousElementSibling.querySelector('.submenu-arrow')
      : null;

    if (arrow) {
      arrow.style.transform = 'rotate(180deg)';
    }
  });

  document.querySelectorAll('.sidebar-nav a:not(.submenu-toggle)').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.innerWidth < 992) {
        closeSidebar();
      }
    });
  });

  // ============================================================
  // SWEET ALERTS
  // ============================================================
  if (window.AppAlerts) {
    function safeTrim(value) {
      return (value || '').toString().trim();
    }

    function shouldSkipSubmit(form) {
      return form.dataset.swalSubmitting === 'true';
    }

    function markSubmitting(form) {
      form.dataset.swalSubmitting = 'true';
    }

    function submitFormNative(form) {
      markSubmitting(form);
      HTMLFormElement.prototype.submit.call(form);
    }

    function getEntityName(element, fallback) {
      return safeTrim(
        (element && element.dataset && element.dataset.entity) ||
          (element && element.getAttribute && element.getAttribute('data-entity')) ||
          fallback ||
          'el registro'
      );
    }

    function getCustomTitle(element, fallback) {
      return safeTrim(
        (element && element.dataset && element.dataset.alertTitle) ||
          (element && element.getAttribute && element.getAttribute('data-alert-title')) ||
          fallback ||
          ''
      );
    }

    function getCustomText(element, fallback) {
      return safeTrim(
        (element && element.dataset && element.dataset.alertText) ||
          (element && element.getAttribute && element.getAttribute('data-alert-text')) ||
          fallback ||
          ''
      );
    }

    function cleanUrlParams(paramsToRemove) {
      try {
        const url = new URL(window.location.href);
        paramsToRemove.forEach((param) => url.searchParams.delete(param));
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      } catch (_) {}
    }

    if (window.AUTH_ALERTS?.loginSuccess) {
      window.AppAlerts.success('¡Bienvenido!', window.AUTH_ALERTS.loginSuccess);
    }

    document.querySelectorAll('form.js-confirm-create').forEach(function (form) {
      form.addEventListener('submit', async function (e) {
        if (shouldSkipSubmit(form)) return;

        e.preventDefault();

        const entity = getEntityName(form, 'el registro');
        const title = getCustomTitle(form, '¿Desea crear este registro?');
        const text = getCustomText(form, `Se creará ${entity}.`);

        const result = await window.AppAlerts.confirmCreate(entity, {
          title,
          text
        });

        if (result.isConfirmed) {
          submitFormNative(form);
        }
      });
    });

    document.querySelectorAll('form.js-confirm-edit').forEach(function (form) {
      form.addEventListener('submit', async function (e) {
        if (shouldSkipSubmit(form)) return;

        e.preventDefault();

        const entity = getEntityName(form, 'el registro');
        const title = getCustomTitle(form, '¿Seguro que desea guardar los cambios?');
        const text = getCustomText(form, `Se actualizará ${entity}.`);

        const result = await window.AppAlerts.confirmEdit(entity, {
          title,
          text
        });

        if (result.isConfirmed) {
          submitFormNative(form);
        }
      });
    });

    document.querySelectorAll('form.js-confirm-delete').forEach(function (form) {
      form.addEventListener('submit', async function (e) {
        if (shouldSkipSubmit(form)) return;

        e.preventDefault();

        const entity = getEntityName(form, 'el registro');
        const title = getCustomTitle(form, '¿Seguro que desea eliminar?');
        const text = getCustomText(
          form,
          `Se eliminará ${entity}. Esta acción no se puede deshacer.`
        );

        const result = await window.AppAlerts.confirmDelete(entity, {
          title,
          text
        });

        if (result.isConfirmed) {
          submitFormNative(form);
        }
      });
    });

    document.querySelectorAll('.js-delete-trigger').forEach(function (button) {
      button.addEventListener('click', async function () {
        const targetSelector =
          button.dataset.targetForm || button.getAttribute('data-target-form');
        if (!targetSelector) return;

        const form = document.querySelector(targetSelector);
        if (!form) return;

        const entity = getEntityName(button, getEntityName(form, 'el registro'));
        const title = getCustomTitle(button, '¿Seguro que desea eliminar?');
        const text = getCustomText(
          button,
          `Se eliminará ${entity}. Esta acción no se puede deshacer.`
        );

        const result = await window.AppAlerts.confirmDelete(entity, {
          title,
          text
        });

        if (result.isConfirmed) {
          submitFormNative(form);
        }
      });
    });

    document
      .querySelectorAll('a.js-confirm-logout, a[href="/auth/logout"]')
      .forEach(function (link) {
        link.addEventListener('click', async function (e) {
          e.preventDefault();

          const href = link.getAttribute('href');
          if (!href) return;

          const title = getCustomTitle(link, '¿Seguro que desea salir?');
          const text = getCustomText(link, 'Se cerrará su sesión actual.');

          const result = await window.AppAlerts.confirmLogout({
            title,
            text
          });

          if (result.isConfirmed) {
            window.location.href = href;
          }
        });
      });

    const params = new URLSearchParams(window.location.search);
    const keysToRemove = [];

    if (params.get('created') === '1') {
      window.AppAlerts.created('Registro');
      keysToRemove.push('created');
    }

    if (params.get('updated') === '1') {
      window.AppAlerts.updated('Registro');
      keysToRemove.push('updated');
    }

    if (params.get('deleted') === '1') {
      window.AppAlerts.deleted('Registro');
      keysToRemove.push('deleted');
    }

    if (params.get('login') === 'success') {
      window.AppAlerts.toast('success', 'Bienvenido');
      keysToRemove.push('login');
    }

    if (params.get('logout') === 'success') {
      window.AppAlerts.toast('success', 'Sesión cerrada correctamente');
      keysToRemove.push('logout');
    }

    if (keysToRemove.length > 0) {
      cleanUrlParams(keysToRemove);
    }
  }

  // ============================================================
  // AUTO-HIDE ALERTS
  // ============================================================
  document.querySelectorAll('.alert-dismissible').forEach(function (alert) {
    setTimeout(function () {
      if (window.bootstrap?.Alert) {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
        if (bsAlert) {
          bsAlert.close();
        }
      }
    }, 5000);
  });

  // ============================================================
  // FORMAT CURRENCY INPUTS
  // ============================================================
  document.querySelectorAll('input[data-currency]').forEach(function (input) {
    input.addEventListener('blur', function () {
      if (this.value) {
        const value = parseFloat(this.value);
        if (!Number.isNaN(value)) {
          this.value = value.toFixed(2);
        }
      }
    });
  });

  // ============================================================
  // TOOLTIPS
  // ============================================================
  const tooltipList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipList.length > 0 && window.bootstrap?.Tooltip) {
    Array.from(tooltipList).forEach(function (el) {
      new bootstrap.Tooltip(el);
    });
  }

  // ============================================================
  // DATE DEFAULTS
  // ============================================================
  document.querySelectorAll('input[type="date"][data-default-today]').forEach(function (input) {
    if (!input.value) {
      input.value = new Date().toISOString().split('T')[0];
    }
  });

  // ============================================================
  // FORM VALIDATION
  // ============================================================
  document.querySelectorAll('form[data-validate]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });

  // ============================================================
  // LOADING STATE FOR SUBMIT BUTTONS
  // ============================================================
  document.querySelectorAll('button[type="submit"]').forEach(function (button) {
    const form = button.closest('form');
    if (!form) return;

    form.addEventListener('submit', function () {
      if (form.matches('[data-validate]') && !form.checkValidity()) return;

      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';

      setTimeout(function () {
        button.disabled = false;
        button.innerHTML = originalText;
      }, 5000);
    });
  });

  // ============================================================
  // SEARCH HIGHLIGHT
  // ============================================================
  const urlParams = new URLSearchParams(window.location.search);
  const searchTerm = urlParams.get('buscar');

  if (searchTerm) {
    const tableBody = document.querySelector('table tbody');
    if (tableBody) {
      const safeSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(' + safeSearch + ')', 'gi');

      tableBody.querySelectorAll('td').forEach(function (cell) {
        if (cell.querySelector('a, button, input, select')) return;
        if (cell.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
          cell.innerHTML = cell.innerHTML.replace(regex, '<mark>$1</mark>');
        }
      });
    }
  }
});

/* ============================================================*/
/* THEME TOGGLE */
/* ============================================================*/
(() => {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  const KEY = 'mero_theme';

  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
  };

  const saved = localStorage.getItem(KEY);
  if (saved) {
    apply(saved);
    toggle.checked = saved === 'dark';
  }

  toggle.addEventListener('change', () => {
    const mode = toggle.checked ? 'dark' : 'light';
    apply(mode);
    localStorage.setItem(KEY, mode);
  });
})();