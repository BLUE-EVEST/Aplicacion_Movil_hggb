1. Sincronizar el proyecto base
Siempre deben asegurarse de tener la última versión de la rama principal:

git checkout main
git pull origin main

2. Crear una rama personal
Cada miembro crea su propia rama con su nombre o el área en la que está trabajando:

git checkout -b nombre-del-integrante-funcion
(Por ejemplo: git checkout -b estephano-mapa o git checkout -b pedro-interfaz).

3. Programar y guardar los cambios
Durante el día, cada integrante hace sus propios add y commit:

git add .
git commit -m "Se agregó la nueva función de navegación"

4. Subir la rama a GitHub
Se publica la rama personal en el repositorio para que los demás puedan verla:

git push -u origin nombre-del-integrante-funcion

5. Revisión y unión (Pull Request)
Cuando la función esté lista y probada, el integrante crea un Pull Request en la web de GitHub para unir su rama con main. Todo el equipo puede revisar los cambios antes de aceptarlos.