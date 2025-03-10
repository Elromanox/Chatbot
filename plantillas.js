const fs = require('fs');

const datos = JSON.parse(fs.readFileSync("info/datos.json", "utf8"));
module.exports = {
	armarPlantillaConsulta: async function(turnos) {
		const plantilla = datos.Respuestas.Turnos.Consulta;
		let respuesta = plantilla.Header;
		let turno;
		const cantidadTurnos = turnos.length;
		for (let i = 1; i <= cantidadTurnos; i++) {
			turno = new Date(turnos.pop().Fecha);
			respuesta += "\n" + plantilla.Items.replace("num", i).replace("fecha", turno.toLocaleString(datos.Configuracion.Locale, datos.Turnos.Formato));
		}
		respuesta += plantilla.Final;
		if (turno != null) {
			respuesta = respuesta.replace(/\{numeroTelefono\}/, turno.Numero);
		}
		return respuesta;
	},

	obtenerPlantillaTurnos: function(turnos) {
		let plantilla = module.exports.armarPlantillaTurnos();
		let resultado = plantilla.replace(/\$\{(.*?)\}/g, (match, key) => {
			let index = key.match(/\[(\d+)\]/)?.[1];
			return turnos[index].toLocaleString(datos.Configuracion.Locale, { weekday: "long", year: 'numeric', day: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric' });
		});
		return resultado;
	},
	armarPlantillaTurnos: function() {
		const partes = datos.Respuestas.Turnos;
		const header = partes.Header;
		let item = partes.Items;
		const final = partes.Final;

		let plantilla = header;
		let resReplace;
		for (let i = 0; i < datos.Turnos.Cantidad; i++) {
			resReplace = item.replace(/num/, i + 1).replace(/num/, i);
			plantilla += "\n" + resReplace;
		}
		plantilla += "\n" + final;
		return plantilla;
	}
}




