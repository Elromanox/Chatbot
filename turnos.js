const db = require('./db');
const fs = require("fs");
const datos = JSON.parse(fs.readFileSync("info/datos.json", "utf8"));


module.exports = {
	obtenerTurnoPorSeleccion: async function(numero) {
		let numReal = numero - 1;
		let ahora = new Date();
		let [turnoActual, salida] = await module.exports.obtenerHorarios(ahora);

		if (ahora > turnoActual) {
			turnoActual.setTime(ahora.getTime().toString().slice(0, 16));
		}


		while (turnoActual <= salida && turnoActual.getMinutes() % datos.Turnos.Periodo !== 0) {
			turnoActual.setMinutes(turnoActual.getMinutes() + 1);
		}
		let siguientesTurnos = await module.exports.obtenerSiguientesTurnos();
		let turnoSiguiente = new Date(siguientesTurnos.pop());
		let turno = new Date();
		for (let i = 0; i <= numReal; i++) {

			while (turnoSiguiente != null && turnoSiguiente.getTime() == turnoActual.getTime()) {
				turnoActual.setMinutes(turnoActual.getMinutes() + datos.Turnos.Periodo);
				turnoSiguiente = new Date(siguientesTurnos.pop());
			}
			if (turnoActual >= salida) {
				[turnoActual, salida] = await module.exports.obtenerHorarios(turnoActual);
			}
			if (i === numReal) {
				turno = new Date(turnoActual);
			}
			turnoActual.setMinutes(turnoActual.getMinutes() + datos.Turnos.Periodo);
		}
		return turno;

	},
	obtenerTurnos: async function() {
		let ahora = new Date();
		let [turnoActual, salida] = await module.exports.obtenerHorarios(ahora);

		if (ahora > turnoActual) {
			turnoActual.setTime(ahora.getTime().toString().slice(0, 16));
		}


		while (turnoActual <= salida && turnoActual.getMinutes() % datos.Turnos.Periodo !== 0) {
			turnoActual.setMinutes(turnoActual.getMinutes() + 1);
		}

		let siguientesTurnos = await module.exports.obtenerSiguientesTurnos();
		let turnoSiguiente = new Date(siguientesTurnos.pop());
		let turnos = [];
		for (let i = 0; i < datos.Turnos.Cantidad; i++) {
			while (turnoSiguiente != null && turnoSiguiente.getTime() == turnoActual.getTime()) {
				turnoActual.setMinutes(turnoActual.getMinutes() + datos.Turnos.Periodo);
				turnoSiguiente = new Date(siguientesTurnos.pop());
			}

			if (turnoActual >= salida) {
				[turnoActual, salida] = await module.exports.obtenerHorarios(turnoActual);
			}
			turnos.push(new Date(turnoActual));
			turnoActual.setMinutes(turnoActual.getMinutes() + datos.Turnos.Periodo);
		}

		return turnos;
	},

	obtenerTurnoPorNumero: async function(numero) {
		const conn = await db.crearConexionAsincronica();
		const query = "SELECT * FROM Turnos WHERE Numero = ? AND Fecha > ? ORDER BY Fecha DESC";

		let [resultados] = await conn.query(
			query,
			[numero, new Date().toISOString().slice(0, 16)]
		);
		return resultados;
	},
	obtenerHorarios: async function(dia) {
		let horarios = [];

		const feriados = JSON.parse(fs.readFileSync("info/feriados.json"), "utf8");


		let tarde = new Date();
		tarde.setHours(12, 0, 0);

		let esTarde = false;
		if (dia >= tarde) {
			esTarde = true;
		}
		let turno = ["Mañana", "Tarde"];

		const query = "SELECT Hora, Tipo FROM Horarios WHERE Dia = ? AND Turno = ? ORDER BY Hora ASC";
		let nombreDia;

		const conn = await db.crearConexionAsincronica();
		try {
			let horarioSalida = new Date(dia);
			horarioSalida.setHours(0, 0, 0, 0);
			while (horarios.length === 0) {

				//Si es un dia feriado, pasar de dia/dias

				while (feriados.some(item => item.fecha === dia.toISOString().split("T")[0])) {
					dia.setDate(dia.getDate() + 1);
					dia.setHours(0, 0, 0);
					esTarde = false;
				}
				nombreDia = dia.toLocaleString(datos.Configuracion.Locale, { weekday: "long" });


				//consultar a la base por los horarios del dia actual
				[horarios] = await conn.query(

					query,
					//turno[+esTarde] funciona pq si esTarde es falso, +esTarde es igual a 0, y si es verdadero, +esTarde es igual a 1
					[nombreDia, turno[+esTarde]]
				)

				//Si hay horario para hoy, actualizar el horario de salida
				if (horarios.length > 0) {
					let [hora, minutos] = horarios[1].Hora.split(":").map(Number);
					horarioSalida.setHours(hora, minutos);
				}

				//Si no hay horarios, ver si es de tarde y cambiar el dia acordemente, y luego cambiar el turno 
				if (horarios.length === 0) {
					if (esTarde) {
						dia.setDate(dia.getDate() + 1);
						dia.setHours(0, 0, 0, 0);
					}
					esTarde = !esTarde;
				}
				//Si estamos justo en el horario de salida, pasar de dia
				if (horarioSalida.getTime() === dia.getTime()) {
					if (esTarde) {
						dia.setDate(dia.getDate() + 1);
						dia.setHours(0, 0, 0, 0);
					}
					esTarde = !esTarde;
					//Reseteo horarios para volver a entrar al loop
					horarios = [];
				};
			}

			const [horaInicio, minInicio] = horarios[0].Hora.split(":").map(Number);
			const [horaSalida, minSalida] = horarios[1].Hora.split(":").map(Number);

			let turnoActual = new Date();
			let salida = new Date();

			turnoActual.setDate(dia.getDate());
			turnoActual.setHours(horaInicio, minInicio, 0, 0);

			salida.setDate(dia.getDate());
			salida.setHours(horaSalida, minSalida, 0, 0);

			turnoActual.setTime(turnoActual.getTime());
			salida.setTime(salida.getTime());

			return [turnoActual, salida];

		} finally {
			conn.end();
		}
	},
	obtenerSiguientesTurnos: async function() {
		const conn = await db.crearConexionAsincronica();
		const query = "SELECT * FROM Turnos WHERE Fecha > ? ORDER BY Fecha DESC"
		const hoy = new Date();

		let [siguientesTurnos] = await conn.query(query,
			hoy.toISOString().slice(0, 16));

		let turnosSiguientes = siguientesTurnos.map(turno => {
			let nuevoTurno = new Date();
			nuevoTurno.setUTCDate(turno.Fecha);
			return nuevoTurno;
		});
		if (siguientesTurnos.length === 0) {
			turnosSiguientes = new Date(0);
		}
		conn.end();
		return turnosSiguientes;

	}
}
