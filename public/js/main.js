/**
 * VITA ERP - JavaScript Principal
 */
document.addEventListener('DOMContentLoaded', function() {

  // ============================================================
  // SIDEBAR DRAWER
  // ============================================================
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const navbarToggle = document.getElementById('navbarSidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');

  // Start collapsed (drawer hidden)
  if (!document.body.classList.contains('sidebar-collapsed')) {
    document.body.classList.add('sidebar-collapsed');
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add('show');
    if (sidebarOverlay) sidebarOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('show');
    if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (navbarToggle) {
    navbarToggle.addEventListener('click', openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('show')) {
      closeSidebar();
    }
  });

  window.addEventListener('resize', function() {
    if (window.innerWidth < 992) {
      closeSidebar();
    }
  });

  // ============================================================
  // SIDEBAR SUBMENUS
  // ============================================================
  const submenuToggles = document.querySelectorAll('.submenu-toggle');
  submenuToggles.forEach(function(toggle) {
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      const parent = this.closest('.nav-item');
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

  document.querySelectorAll('.sidebar-submenu.show').forEach(function(submenu) {
    const arrow = submenu.previousElementSibling
      ? submenu.previousElementSibling.querySelector('.submenu-arrow')
      : null;
    if (arrow) {
      arrow.style.transform = 'rotate(180deg)';
    }
  });

  document.querySelectorAll('.sidebar-nav a:not(.submenu-toggle)').forEach(function(link) {
    link.addEventListener('click', closeSidebar);
  });

  // ============================================================
  // CONFIRM DELETE
  // ============================================================
  document.querySelectorAll('form[data-confirm]').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      var message = this.dataset.confirm || '¿Estás seguro de realizar esta acción?';
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });

  // ============================================================
  // AUTO-HIDE ALERTS
  // ============================================================
  document.querySelectorAll('.alert-dismissible').forEach(function(alert) {
    setTimeout(function() {
      var bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      if (bsAlert) {
        bsAlert.close();
      }
    }, 5000);
  });

  // ============================================================
  // FORMAT CURRENCY INPUTS
  // ============================================================
  document.querySelectorAll('input[data-currency]').forEach(function(input) {
    input.addEventListener('blur', function() {
      if (this.value) {
        this.value = parseFloat(this.value).toFixed(2);
      }
    });
  });

  // ============================================================
  // TOOLTIPS
  // ============================================================
  var tooltipList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipList.length > 0) {
    Array.from(tooltipList).forEach(function(el) {
      new bootstrap.Tooltip(el);
    });
  }

  // ============================================================
  // DATE DEFAULTS
  // ============================================================
  document.querySelectorAll('input[type="date"][data-default-today]').forEach(function(input) {
    if (!input.value) {
      input.value = new Date().toISOString().split('T')[0];
    }
  });

  // ============================================================
  // FORM VALIDATION
  // ============================================================
  document.querySelectorAll('form[data-validate]').forEach(function(form) {
    form.addEventListener('submit', function(e) {
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
  document.querySelectorAll('button[type="submit"]').forEach(function(button) {
    var form = button.closest('form');
    if (form && !form.id) {
      form.addEventListener('submit', function() {
        button.disabled = true;
        var originalText = button.innerHTML;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';

        setTimeout(function() {
          button.disabled = false;
          button.innerHTML = originalText;
        }, 5000);
      });
    }
  });

  // ============================================================
  // SELECTS BUSCABLES (listas largas de empleados)
  // ============================================================
  // Convierte cualquier <select> con muchas opciones en un combo con caja de
  // búsqueda: se filtra por nombre o apellido conforme se escribe. El <select>
  // original se conserva oculto, así que los formularios siguen enviando
  // ID_Empleado igual que antes (no hay que tocar controllers ni vistas).
  //
  // Se aplica a: selects marcados con [data-buscable], o cualquiera cuyo
  // name/id sea ID_Empleado con más de 8 opciones.
  var MINIMO_PARA_BUSCADOR = 8;

  function esCandidato(sel) {
    if (sel.multiple || sel.dataset.buscableListo) return false;
    if (sel.hasAttribute('data-buscable')) return true;
    var esEmpleado = sel.name === 'ID_Empleado' || sel.id === 'ID_Empleado' ||
                     sel.name === 'empleado' || sel.name === 'ID_Encargado_Empleado';
    return esEmpleado && sel.options.length > MINIMO_PARA_BUSCADOR;
  }

  function hacerBuscable(sel) {
    sel.dataset.buscableListo = '1';

    var wrap = document.createElement('div');
    wrap.className = 'select-buscable position-relative';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('d-none');

    // Caja visible que imita al select y sirve de buscador.
    var input = document.createElement('input');
    input.type = 'text';
    input.className = sel.className.replace('d-none', '').trim() || 'form-control';
    input.setAttribute('autocomplete', 'off');
    input.placeholder = sel.options[sel.selectedIndex]
      ? (sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].textContent.trim() : 'Buscar por nombre o apellido...')
      : 'Buscar por nombre o apellido...';
    if (sel.selectedIndex > 0) input.value = sel.options[sel.selectedIndex].textContent.trim();
    wrap.appendChild(input);

    var lista = document.createElement('div');
    lista.className = 'list-group position-absolute w-100 shadow-sm d-none';
    lista.style.cssText = 'z-index:1080; max-height:260px; overflow-y:auto; top:100%';
    wrap.appendChild(lista);

    // Opciones reales (se omite el placeholder vacío).
    var opciones = Array.from(sel.options)
      .map(function(o, i) { return { i: i, valor: o.value, texto: o.textContent.trim() }; })
      .filter(function(o) { return o.valor !== ''; });

    function pintar(filtro) {
      var q = (filtro || '').toLowerCase().trim();
      var visibles = q
        ? opciones.filter(function(o) { return o.texto.toLowerCase().includes(q); })
        : opciones;

      if (visibles.length === 0) {
        lista.innerHTML = '<div class="list-group-item text-body-secondary small">Sin coincidencias</div>';
      } else {
        lista.innerHTML = visibles.slice(0, 60).map(function(o) {
          return '<button type="button" class="list-group-item list-group-item-action py-1 small" data-i="' + o.i + '">' +
                 o.texto + '</button>';
        }).join('') +
        (visibles.length > 60
          ? '<div class="list-group-item text-body-secondary small">…y ' + (visibles.length - 60) + ' más — sigue escribiendo</div>'
          : '');
      }
      lista.classList.remove('d-none');
    }

    input.addEventListener('focus', function() { input.select(); pintar(''); });
    input.addEventListener('input', function() { pintar(input.value); });

    lista.addEventListener('mousedown', function(ev) {
      var btn = ev.target.closest('[data-i]');
      if (!btn) return;
      ev.preventDefault();
      sel.selectedIndex = parseInt(btn.dataset.i);
      input.value = sel.options[sel.selectedIndex].textContent.trim();
      lista.classList.add('d-none');
      // Notificar a los listeners que ya tenía el <select> original.
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });

    input.addEventListener('blur', function() {
      setTimeout(function() {
        lista.classList.add('d-none');
        // Sin selección válida, se limpia para no dejar texto engañoso.
        if (sel.selectedIndex <= 0) { input.value = ''; }
        else { input.value = sel.options[sel.selectedIndex].textContent.trim(); }
      }, 150);
    });

    // Enter elige la primera coincidencia.
    input.addEventListener('keydown', function(ev) {
      if (ev.key !== 'Enter') return;
      var primero = lista.querySelector('[data-i]');
      if (!primero) return;
      ev.preventDefault();
      sel.selectedIndex = parseInt(primero.dataset.i);
      input.value = sel.options[sel.selectedIndex].textContent.trim();
      lista.classList.add('d-none');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Si el form exige el campo, validar contra el select real.
    if (sel.required) {
      sel.form && sel.form.addEventListener('submit', function(ev) {
        if (sel.selectedIndex <= 0) {
          ev.preventDefault();
          input.classList.add('is-invalid');
          input.focus();
        }
      });
      input.addEventListener('input', function() { input.classList.remove('is-invalid'); });
    }
  }

  document.querySelectorAll('select').forEach(function(sel) {
    if (esCandidato(sel)) hacerBuscable(sel);
  });

  // ============================================================
  // SEARCH HIGHLIGHT
  // ============================================================
  var urlParams = new URLSearchParams(window.location.search);
  var searchTerm = urlParams.get('buscar');

  if (searchTerm) {
    var tableBody = document.querySelector('table tbody');
    if (tableBody) {
      var regex = new RegExp('(' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      tableBody.querySelectorAll('td').forEach(function(cell) {
        if (cell.querySelector('a, button, input, select')) return;
        if (cell.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
          cell.innerHTML = cell.innerHTML.replace(regex, '<mark>$1</mark>');
        }
      });
    }
  }

});