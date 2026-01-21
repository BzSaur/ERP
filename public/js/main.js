/**
 * ERP - Recursos Humanos
 * JavaScript Principal
 */

document.addEventListener('DOMContentLoaded', function() {
  
  // ============================================================
  // SIDEBAR TOGGLE
  // ============================================================
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  
  // Cargar estado guardado del sidebar
  const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (sidebarCollapsed && window.innerWidth >= 992) {
    document.body.classList.add('sidebar-collapsed');
  }
  
  function isMobile() {
    return window.innerWidth < 992;
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
  
  function toggleSidebarCollapse() {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed'));
    
    // Actualizar icono del toggle
    const toggleIcon = sidebarToggle?.querySelector('i');
    if (toggleIcon) {
      if (document.body.classList.contains('sidebar-collapsed')) {
        toggleIcon.classList.remove('bi-list');
        toggleIcon.classList.add('bi-chevron-right');
      } else {
        toggleIcon.classList.remove('bi-chevron-right');
        toggleIcon.classList.add('bi-list');
      }
    }
  }
  
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', openSidebar);
  }
  
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      if (isMobile()) {
        closeSidebar();
      } else {
        toggleSidebarCollapse();
      }
    });
    
    // Actualizar icono inicial si está colapsado
    if (sidebarCollapsed && !isMobile()) {
      const toggleIcon = sidebarToggle.querySelector('i');
      if (toggleIcon) {
        toggleIcon.classList.remove('bi-list');
        toggleIcon.classList.add('bi-chevron-right');
      }
    }
  }
  
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }
  
  // Manejar cambio de tamaño de ventana
  window.addEventListener('resize', function() {
    if (isMobile()) {
      closeSidebar();
    }
  });
  
  // ============================================================
  // SIDEBAR SUBMENUS
  // ============================================================
  const submenuToggles = document.querySelectorAll('.submenu-toggle');
  submenuToggles.forEach(toggle => {
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      const parent = this.closest('.nav-item');
      const submenu = parent.querySelector('.sidebar-submenu');
      const arrow = this.querySelector('.submenu-arrow');
      
      // Si el sidebar está colapsado en desktop, no hacer nada
      if (!isMobile() && document.body.classList.contains('sidebar-collapsed')) {
        return;
      }
      
      // Toggle submenu
      if (submenu) {
        submenu.classList.toggle('show');
        if (arrow) {
          arrow.style.transform = submenu.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  });
  
  // Inicializar flechas de submenús abiertos
  document.querySelectorAll('.sidebar-submenu.show').forEach(submenu => {
    const arrow = submenu.previousElementSibling?.querySelector('.submenu-arrow');
    if (arrow) {
      arrow.style.transform = 'rotate(180deg)';
    }
  });
  
  // ============================================================
  // CONFIRM DELETE
  // ============================================================
  const deleteForms = document.querySelectorAll('form[data-confirm]');
  deleteForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const message = this.dataset.confirm || '¿Estás seguro de realizar esta acción?';
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });
  
  // ============================================================
  // AUTO-HIDE ALERTS
  // ============================================================
  const alerts = document.querySelectorAll('.alert-dismissible');
  alerts.forEach(alert => {
    setTimeout(() => {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      if (bsAlert) {
        bsAlert.close();
      }
    }, 5000);
  });
  
  // ============================================================
  // FORMAT CURRENCY INPUTS
  // ============================================================
  const currencyInputs = document.querySelectorAll('input[data-currency]');
  currencyInputs.forEach(input => {
    input.addEventListener('blur', function() {
      if (this.value) {
        this.value = parseFloat(this.value).toFixed(2);
      }
    });
  });
  
  // ============================================================
  // TOOLTIPS
  // ============================================================
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  if (tooltipTriggerList.length > 0) {
    [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el));
  }
  
  // ============================================================
  // DATE FORMAT (Spanish)
  // ============================================================
  const dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach(input => {
    if (!input.value) {
      // Set default to today if empty and has data-default-today
      if (input.dataset.defaultToday) {
        input.value = new Date().toISOString().split('T')[0];
      }
    }
  });
  
  // ============================================================
  // FORM VALIDATION STYLES
  // ============================================================
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
  
  // ============================================================
  // LOADING STATE FOR BUTTONS
  // ============================================================
  const submitButtons = document.querySelectorAll('button[type="submit"]');
  submitButtons.forEach(button => {
    const form = button.closest('form');
    if (form) {
      form.addEventListener('submit', function() {
        button.disabled = true;
        const originalText = button.innerHTML;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';
        
        // Re-enable after 5 seconds (fallback)
        setTimeout(() => {
          button.disabled = false;
          button.innerHTML = originalText;
        }, 5000);
      });
    }
  });
  
  // ============================================================
  // SEARCH HIGHLIGHT
  // ============================================================
  const urlParams = new URLSearchParams(window.location.search);
  const searchTerm = urlParams.get('buscar');
  
  if (searchTerm) {
    const tableBody = document.querySelector('table tbody');
    if (tableBody) {
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      tableBody.querySelectorAll('td').forEach(cell => {
        if (cell.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
          cell.innerHTML = cell.innerHTML.replace(regex, '<mark>$1</mark>');
        }
      });
    }
  }
  
  console.log('✅ ERP RH - JavaScript cargado correctamente');
});
