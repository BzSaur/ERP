// Empleado "real" = sigue en la empresa: cualquier estatus menos BAJA
// (VACACIONES, INCAPACIDAD y SUSPENDIDO siguen contando). Por nombre, no por ID.
export const whereVigente = { estatus: { is: { Nombre_Estatus: { not: 'BAJA' } } } };
export const whereBaja = { estatus: { is: { Nombre_Estatus: 'BAJA' } } };
