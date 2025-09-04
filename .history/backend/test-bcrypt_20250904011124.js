import bcrypt from "bcryptjs";

// La contraseña a probar
const password = "123456";

// El hash que guardaste en la BD
const hash = "$2b$10$FhQZV5zQXBL5jFKFb9z63u/2tZ/6wDYx7EXe.tG2o6ZozT3Yp9N7i";

const run = async () => {
  const ok = await bcrypt.compare(password, hash);
  console.log("¿Coincide la contraseña con el hash?:", ok);
};

run();
