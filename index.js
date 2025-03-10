const fs = require("fs");
const twilio = require("twilio");
const express = require('express');
const db = require('./db')
const turnosFunc = require('./turnos');
const plantillas = require('./plantillas');
const datos = JSON.parse(fs.readFileSync("info/datos.json", "utf8"));

const app = express();

//Obtengo los feriados unicamente al iniciar el programa
obtenerFeriados();

app.use(express.urlencoded({ extended: false }));
app.post('/whatsapp', (req, res) => {
	console.log(req.body.Body);
	responderMensaje(res, req);
	registrarMensaje(req);

});

const port = datos.Base.puerto;
app.listen(port, () => {
	console.log(`Servidor corriendo en http://localhost:${port}`);
});

async function responderMensaje(response, request) {

	const mensaje = request.body.Body;
	const anteriorMensaje = (await obtenerMensaje(request.body.WaId, 0)).toLowerCase();
	const anteUltimoMensaje = (await obtenerMensaje(request.body.WaId, 1)).toLowerCase();

	const numero = request.body.WaId;

	let respuesta;

	if (anteriorMensaje == "nada encontrado") {
		enviarRespuesta(datos.Respuestas.PrimerMensaje, response);
		return 0;
	} else
		if (mensaje.toLowerCase().includes("turno")) {
			//Determino si el mensaje pide consultar turnos dados, o si es para sacar un turno
			if (mensaje.toLowerCase().includes("consulta")) {
				let turnos = await turnosFunc.obtenerTurnoPorNumero(numero);
				respuesta = await plantillas.armarPlantillaConsulta(turnos);
			} else {
				const turnos = await turnosFunc.obtenerTurnos();
				respuesta = plantillas.obtenerPlantillaTurnos(turnos);
			}


		}//Si el mensaje enviado actualmente no contiene consulta de turno, me fijo si el anterior fue una consulta para ver que turno fue elegido
		else if (anteriorMensaje.includes("turno") && !(anteriorMensaje.includes("consulta"))) {
			//Caso en el que se haya seleccionado algun turno
			let turno = await buscarTurnoPorMensaje(mensaje);

			if (turno == null) {
				respuesta = datos.Respuestas.Turnos.Invalido;
			} else {
				respuesta = datos.Respuestas.Turnos.Confirmado;

				let turnoString = turno.toLocaleString(datos.Configuracion.Locale, datos.Turnos.Formato);
				respuesta = respuesta.replace(/\$\{(.*?)\}/g, turnoString);

			}

		} else if (anteUltimoMensaje.includes("turno") && !(anteriorMensaje.includes("consulta")) && !(anteUltimoMensaje.includes("consulta"))) {
			let turno = await buscarTurnoPorMensaje(anteriorMensaje);

			if (turno == null) {
				respuesta = await obtenerRespuestaConBase(mensaje);
			} else {
				let nombre = mensaje;
				await registrarTurno(nombre, turno, numero);
				respuesta = datos.Respuestas.Turnos.Registrado;
			}
		} else {
			respuesta = await obtenerRespuestaConBase(mensaje);

			if (!respuesta) {
				respuesta = datos.Respuestas.notFound;
			}
		}
	enviarRespuesta(respuesta, response);

}

async function buscarTurnoPorMensaje(mensaje) {
	let turno;
	for (let i = 1; i <= datos.Turnos.Cantidad && turno == null; i++) {
		if (mensaje.includes(i)) {
			turno = await turnosFunc.obtenerTurnoPorSeleccion(i);
		}
	}
	return turno;
}

async function obtenerRespuestaConBase(mensaje) {
	const conn = await db.crearConexionAsincronica();
	const palabras = mensaje.toLowerCase().match(/\b\w+\b/g);
	const condiciones = palabras.map(() => "Clave LIKE ?").join(" OR ");
	const valores = palabras.map(palabra => `%${palabra}%`);

	const query = `SELECT * FROM Respuestas WHERE Prioridad IS NOT NULL AND (${condiciones}) ORDER BY Prioridad ASC`;

	try {
		let [resultados] = await conn.query(query, valores);
		let msgVuelta = resultados.map(resultado => resultado.Response).join("\n");
		return msgVuelta;
	} finally {
		conn.end();
	}


}

function enviarRespuesta(respuesta, response) {

	const twiml = new twilio.twiml.MessagingResponse();
	const mensaje = twiml.message();
	mensaje.body(respuesta);

	response.type("text/xml");

	response.send(mensaje.toString());

}

async function obtenerMensaje(numero, cantidadAntes) {
	const conn = await db.crearConexionAsincronica();
	const query = "SELECT Mensaje FROM Mensajes WHERE Numero = ? AND id_Mensaje = (SELECT MAX(id_Mensaje)-? FROM Mensajes WHERE Numero = ?) ";
	const [resultado] = await conn.query(query, [numero, cantidadAntes, numero]);
	if (resultado.length === 0) {
		return "Nada encontrado";
	}
	conn.end();
	return resultado[0].Mensaje;
}

async function registrarTurno(nombre, fecha, numero) {
	const query = "INSERT INTO Turnos(Fecha, Nombre, Numero) VALUES (?, ?, ?)";
	const conn = await db.crearConexionAsincronica();
	const fechaString = fecha.toISOString().slice(0, 16);
	await conn.query(query, [fechaString, nombre, numero]);
	conn.end();
}

async function registrarMensaje(request) {
	const conn = await db.crearConexionAsincronica();
	const mensaje = request.body.Body;
	const numero = request.body.WaId;

	const ultimoId = await obtenerUltimoId(numero);

	await conn.query(
		"INSERT INTO Mensajes(Numero, id_Mensaje, Mensaje) VALUES(? , ?, ?)",
		[numero, ultimoId + 1, mensaje]
	)
}
async function obtenerUltimoId(numero) {
	const conn = await db.crearConexionAsincronica();
	const [resultado] = await conn.query("SELECT COALESCE((SELECT MAX(id_Mensaje) FROM Mensajes WHERE Numero = ?),0) AS id", [numero + ""]);
	conn.end();
	return resultado[0].id;

}

async function obtenerFeriados() {
	//Obtengo feriados del año actual
	const feriados = await fetch('https://api.argentinadatos.com/v1/feriados/');
	const datos = await feriados.json();
	//Los escribo a un JSON para tener registro
	fs.writeFile('info/feriados.json', JSON.stringify(datos), err => console.log(err));;
}
