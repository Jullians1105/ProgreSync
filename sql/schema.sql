-- sql/schema.sql

-- Creo la base de datos para el proyecto
CREATE DATABASE IF NOT EXISTS progresync;
USE progresync;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  rol ENUM('estudiante','docente','admin') NOT NULL
);

-- Tabla de entregas
CREATE TABLE IF NOT EXISTS entregas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_estudiante INT NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  descripcion TEXT,
  archivo VARCHAR(255) NOT NULL,
  estado ENUM('en_revision','aprobado','rechazado') DEFAULT 'en_revision',
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_estudiante) REFERENCES usuarios(id)
);

-- Tabla de revisiones
CREATE TABLE IF NOT EXISTS revisiones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_entrega INT NOT NULL,
  id_docente INT NOT NULL,
  nuevo_estado ENUM('en_revision','aprobado','rechazado') NOT NULL,
  comentario TEXT,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_entrega) REFERENCES entregas(id),
  FOREIGN KEY (id_docente) REFERENCES usuarios(id)
);
