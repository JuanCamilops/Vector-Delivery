# Vector Delivery — Edición Web 3D Modular (v2.6 Hardcore + Rotacional y Lorentz)

Videojuego educativo tridimensional desarrollado con **HTML5, CSS3, JavaScript (ES6+) y Three.js (WebGL)** para la asignatura de **Cálculo Vectorial**.

## Qué incluye esta versión

1. **Toda la base v2.5 Hardcore restaurada y funcional:**
   - **Torres sólidas** con colisiones físicas Esfera-Caja (`resolveSphereAABBCollision`), rebote elástico, daño a la integridad del casco, destello rojo y sacudida de cámara.
   - **Plataforma Alfa y Plataforma Destino** con recogida y entrega de paquetes, partícula de líneas de corriente, malla vectorial 3D (`[V]`), gancho de gradiente (`[E]`), inspección académica (`[P]`) y controles táctiles móviles.
   - **🎓 Modo Profesor** conectado al motor matemático para editar ecuaciones $\vec{F}(x, y, z, t)$ y $f(x, y, z)$ en tiempo real.
2. **Nuevas mecánicas de Cálculo Vectorial (`dronePhysics.js` + `mathEngine.js`):**
   - Rotacional $\nabla \times \mathbf{F}$ con torque rotacional por cuaterniones, detección de campos conservativos vs. no conservativos y efecto **Slingshot**.
   - **Nivel 4: Vórtices ($\nabla \times \mathbf{F}$) y Fuerza de Lorentz**, con paquete cargado ($q = 1.35$) desviado por $\mathbf{F}_L = q(\mathbf{v} \times \mathbf{B})$ e integral de línea $W = \int_C \mathbf{F} \cdot d\mathbf{r}$.

## Cómo Ejecutar Localmente

```bash
cd Vector_Delivery_Web3D_v2
python -m http.server 8000
```
Luego abre `http://localhost:8000` en tu navegador (o usa **Live Server** en VS Code).
