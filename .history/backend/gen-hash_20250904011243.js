import bcrypt from "bcryptjs";

const password = "123456";

const run = async () => {
  const hash = await bcrypt.hash(password, 10);
  console.log("Hash generado:", hash);
};

run();
