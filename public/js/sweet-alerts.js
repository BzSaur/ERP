(function (window) {
  'use strict';

  const hasSwal = () => typeof window.Swal !== 'undefined';

  const defaultConfirmButtonColor = '#6c5ce7';
  const defaultCancelButtonColor = '#6c757d';
  const defaultDangerButtonColor = '#d33';

  function fire(options) {
    if (!hasSwal()) {
      const fallbackText = options && (options.text || options.title) ? (options.text || options.title) : 'Operación completada.';
      window.alert(fallbackText);
      return Promise.resolve({ isConfirmed: true });
    }

    return window.Swal.fire(Object.assign({
      confirmButtonColor: defaultConfirmButtonColor,
      confirmButtonText: 'OK'
    }, options || {}));
  }

  function success(title, text, options) {
    return fire(Object.assign({ icon: 'success', title: title || 'Operación realizada', text: text || '' }, options || {}));
  }

  function error(title, text, options) {
    return fire(Object.assign({ icon: 'error', title: title || 'Ocurrió un error', text: text || '' }, options || {}));
  }

  function warning(title, text, options) {
    return fire(Object.assign({ icon: 'warning', title: title || 'Atención', text: text || '' }, options || {}));
  }

  function info(title, text, options) {
    return fire(Object.assign({ icon: 'info', title: title || 'Información', text: text || '' }, options || {}));
  }

  function confirm(options) {
    if (!hasSwal()) {
      const message = (options && (options.text || options.title)) || '¿Desea continuar?';
      return Promise.resolve({ isConfirmed: window.confirm(message) });
    }

    return window.Swal.fire(Object.assign({
      icon: 'question',
      title: '¿Desea continuar?',
      text: '',
      showCancelButton: true,
      confirmButtonText: 'Aceptar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      confirmButtonColor: defaultConfirmButtonColor,
      cancelButtonColor: defaultCancelButtonColor
    }, options || {}));
  }

  function created(entityName) {
    return success('Creado correctamente', entityName ? `${entityName} se creó correctamente.` : 'El registro se creó correctamente.');
  }

  function updated(entityName) {
    return success('Actualizado correctamente', entityName ? `${entityName} se actualizó correctamente.` : 'El registro se actualizó correctamente.');
  }

  function deleted(entityName) {
    return success('Eliminado correctamente', entityName ? `${entityName} se eliminó correctamente.` : 'El registro se eliminó correctamente.');
  }

  function confirmDelete(entityName, options) {
    return confirm(Object.assign({
      icon: 'warning',
      title: '¿Seguro que desea eliminar?',
      text: entityName
        ? `Se eliminará ${entityName}. Esta acción no se puede deshacer.`
        : 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: defaultDangerButtonColor,
      cancelButtonColor: defaultCancelButtonColor
    }, options || {}));
  }

  function confirmEdit(entityName, options) {
    return confirm(Object.assign({
      icon: 'question',
      title: '¿Seguro que desea guardar los cambios?',
      text: entityName ? `Se actualizará ${entityName}.` : 'Se guardarán los cambios realizados.',
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar'
    }, options || {}));
  }

  function confirmCreate(entityName, options) {
    return confirm(Object.assign({
      icon: 'question',
      title: '¿Desea crear este registro?',
      text: entityName ? `Se creará ${entityName}.` : 'Se creará un nuevo registro.',
      confirmButtonText: 'Sí, crear',
      cancelButtonText: 'Cancelar'
    }, options || {}));
  }

  function confirmLogout(options) {
    return confirm(Object.assign({
      icon: 'warning',
      title: '¿Seguro que desea salir?',
      text: 'Se cerrará su sesión actual.',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: defaultDangerButtonColor,
      cancelButtonColor: defaultCancelButtonColor
    }, options || {}));
  }

  function toast(icon, title, options) {
    return fire(Object.assign({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      icon: icon || 'success',
      title: title || ''
    }, options || {}));
  }

  window.AppAlerts = {
    fire,
    success,
    error,
    warning,
    info,
    confirm,
    created,
    updated,
    deleted,
    confirmDelete,
    confirmEdit,
    confirmCreate,
    confirmLogout,
    toast
  };
})(window);
