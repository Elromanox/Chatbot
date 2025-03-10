const sqlAsync = require('mysql2/promise');

const fs = require("fs");
const datos = JSON.parse(fs.readFileSync("info/datos.json", "utf8"));

module.exports = {
	crearConexionAsincronica: async function() {
		return sqlAsync.createConnection({
			host: datos.Base.host,
			user: datos.Base.user,
			database: datos.Base.nombreBase
		});
	}
}
