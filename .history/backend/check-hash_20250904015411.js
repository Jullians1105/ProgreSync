import bcrypt from "bcryptjs";

const hash = "$2a$10$9oW3gOTCY2SSFx1IY.HN2eJJjit2Zs51d9QY12E9ihoocpK01/aFi"; // hash que está en la BD
const password = "123456";

const ok = await bcrypt.compare(password, hash);
console.log("¿Coincide con 123456?:", ok);
