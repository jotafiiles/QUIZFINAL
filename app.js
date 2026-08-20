/**
 * app.js - Lógica Principal (HTML, CSS y JavaScript ES6 puro)
 * Consume directamente Firebase Realtime Database desde firebase.js
 */

import { db, ref, set, get, push, onValue } from "./firebase.js";

const QUIZ_SECUENCIA = ["quiz1", "quiz2", "quiz3", "quiz4", "examen_final"];

// Nombres descriptivos para los Quizzes en la interfaz
const QUIZ_TITULOS = {
  quiz1: "Quiz 1: Seguridad Laboral y Prevención",
  quiz2: "Quiz 2: Primeros Auxilios e Incendios",
  quiz3: "Quiz 3: Sustancias Peligrosas y Ergonomía",
  quiz4: "Quiz 4: Trabajos de Alto Riesgo y LOTO",
  examen_final: "Examen Final Integrado"
};

// Mapas para almacenar estados previos del ranking y detectar ascensos/descensos
let rankingPreviousPositions = new Map();
let isFirstRankingRender = true;

// Se ejecuta al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  const formParticipante = document.getElementById("form-participante");
  const formQuiz = document.getElementById("form-quiz");
  const tableResultados = document.getElementById("table-resultados");
  const profTableBody = document.getElementById("prof-table-body");

  if (formParticipante) {
    initIndexPage(formParticipante);
  }

  if (document.getElementById("ranking-live-list") || document.getElementById("podium-container") || document.getElementById("ranking-table-body")) {
    initHomePage();
  }

  if (formQuiz) {
    initQuizPage(formQuiz);
  }

  if (tableResultados) {
    initDashboardPage(tableResultados);
  }

  if (profTableBody || document.getElementById("prof-total-evaluados")) {
    initProfesorPage();
  }
});

/* ==========================================================================
   1. PÁGINA INDEX - REGISTRO DE PARTICIPANTE
   ========================================================================== */
function initIndexPage(form) {
  const alertError = document.getElementById("alert-error");
  const alertText = document.getElementById("alert-text");
  const btnComenzar = document.getElementById("btn-comenzar");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (alertError) alertError.style.display = "none";

    const nombre = document.getElementById("nombre").value.trim();
    const rut = document.getElementById("rut").value.trim();

    // Validación de campos obligatorios (Nombre y RUT)
    if (!nombre || !rut) {
      if (alertText && alertError) {
        alertText.textContent = "Por favor complete todos los campos obligatorios: Nombre Completo y RUT.";
        alertError.style.display = "flex";
      }
      return;
    }

    try {
      if (btnComenzar) {
        btnComenzar.disabled = true;
        btnComenzar.textContent = "Guardando...";
      }

      // Guardar participante en node 'participantes' en Firebase RTDB
      const participantesRef = ref(db, "participantes");
      const nuevoParticipanteRef = push(participantesRef);
      const participanteId = nuevoParticipanteRef.key;

      const datosParticipante = {
        id: participanteId,
        nombre: nombre,
        rut: rut,
        fechaRegistro: new Date().toISOString()
      };

      await set(nuevoParticipanteRef, datosParticipante);

      // Guardar datos e ID del participante en localStorage
      localStorage.setItem("participante_id", participanteId);
      localStorage.setItem("participante_actual", JSON.stringify(datosParticipante));

      // Resetear estado previo de quizzes
      localStorage.removeItem("respuestas_acumuladas");
      localStorage.setItem("quiz_secuencia_index", "0");

      // Redirigir a quiz.html
      window.location.href = "quiz.html";

    } catch (error) {
      console.error("Error al registrar participante en Firebase:", error);
      if (alertText && alertError) {
        alertText.textContent = "Error al conectar con la base de datos. Por favor intente nuevamente.";
        alertError.style.display = "flex";
      }
      if (btnComenzar) {
        btnComenzar.disabled = false;
        btnComenzar.textContent = "COMENZAR";
      }
    }
  });
}

/* ==========================================================================
   1B. PÁGINA INDEX - RANKING, PODIO, ESTADÍSTICAS Y MÓDULOS EN TIEMPO REAL
   ========================================================================== */

let homeState = {
  participantes: {},
  resultados: {},
  quizzes: {},
  searchTerm: ""
};

function initHomePage() {
  const podiumContainer = document.getElementById("podium-container");
  const rankingTableBody = document.getElementById("ranking-table-body");
  const searchInput = document.getElementById("ranking-search-input");

  // Escuchar nodo 'participantes'
  const partRef = ref(db, "participantes");
  onValue(partRef, (snap) => {
    homeState.participantes = snap.val() || {};
    renderHomePage();
  });

  // Escuchar nodo 'resultados'
  const resRef = ref(db, "resultados");
  onValue(resRef, (snap) => {
    homeState.resultados = snap.val() || {};
    renderHomePage();
  });

  // Escuchar nodo 'quizzes'
  const quizzesRef = ref(db, "quizzes");
  onValue(quizzesRef, (snap) => {
    homeState.quizzes = snap.val() || {};
    renderHomePage();
  });

  // Búsqueda en vivo
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      homeState.searchTerm = e.target.value.toLowerCase().trim();
      renderHomePage();
    });
  }
}

// Renderizador unificado del Ranking Dinámico en tiempo real
function renderHomePage() {
  const rankingLiveList = document.getElementById("ranking-live-list");
  const podiumContainer = document.getElementById("podium-container");
  const rankingTableBody = document.getElementById("ranking-table-body");
  const heroComenzarBtn = document.getElementById("btn-hero-comenzar");

  // Quizzes list from DB or default sequence
  const dbQuizzesKeys = Object.keys(homeState.quizzes || {});
  const quizKeys = dbQuizzesKeys.length > 0 ? dbQuizzesKeys : QUIZ_SECUENCIA;
  const totalQuizzesCount = quizKeys.length;

  // Mapa de consolidación de participantes reales
  const mapParticipantes = new Map();

  // 1. Cargar participantes registrados
  Object.keys(homeState.participantes || {}).forEach((k) => {
    const p = homeState.participantes[k];
    if (p && p.nombre) {
      const keyId = (p.rut || p.id || k).trim();
      mapParticipantes.set(keyId, {
        id: p.id || k,
        nombre: p.nombre,
        rut: p.rut || "",
        fechaRegistro: p.fechaRegistro || "",
        quizzesCompletados: 0,
        puntos: 0,
        porcentaje: 0,
        respuestas: p.progreso?.respuestas || {},
        esActivo: false
      });
    }
  });

  // 2. Consolidar con historial de resultados reales
  Object.keys(homeState.resultados || {}).forEach((k) => {
    const res = homeState.resultados[k];
    if (res && res.nombre) {
      const keyId = (res.rut || res.id || res.nombre).trim();
      let part = mapParticipantes.get(keyId);
      if (!part) {
        part = {
          id: res.id || k,
          nombre: res.nombre,
          rut: res.rut || "",
          fechaRegistro: res.fecha || "",
          quizzesCompletados: 0,
          puntos: 0,
          porcentaje: 0,
          respuestas: res.respuestas || {},
          esActivo: true
        };
        mapParticipantes.set(keyId, part);
      }

      // Calcular cantidad de quizzes completados
      const respuestasObj = res.respuestas || {};
      const numRespQuizzes = Object.keys(respuestasObj).length;
      let qCompleted = numRespQuizzes;
      if (qCompleted === 0 && (res.porcentaje !== undefined || res.estado)) {
        qCompleted = totalQuizzesCount;
      }

      if (qCompleted > part.quizzesCompletados) {
        part.quizzesCompletados = qCompleted;
      }

      if (res.correctas !== undefined && res.correctas > part.puntos) {
        part.puntos = res.correctas;
      }

      if (res.porcentaje !== undefined && res.porcentaje > part.porcentaje) {
        part.porcentaje = res.porcentaje;
      }

      part.esActivo = true;
    }
  });

  // 3. Chequear participante activo en sesión local (localStorage)
  let currentLocalUser = null;
  try {
    const localUserRaw = localStorage.getItem("participante_actual");
    if (localUserRaw) {
      currentLocalUser = JSON.parse(localUserRaw);
    }
  } catch (e) {
    console.log("Error leyendo localStorage:", e);
  }

  let localRespuestasAcumuladas = {};
  try {
    const respRaw = localStorage.getItem("respuestas_acumuladas");
    if (respRaw) {
      localRespuestasAcumuladas = JSON.parse(respRaw);
    }
  } catch (e) {}

  const localQuizzesFinished = Object.keys(localRespuestasAcumuladas).length;

  if (currentLocalUser && currentLocalUser.nombre) {
    const localKey = (currentLocalUser.rut || currentLocalUser.id || currentLocalUser.nombre).trim();
    let part = mapParticipantes.get(localKey);
    if (!part) {
      part = {
        id: currentLocalUser.id || "local-user",
        nombre: currentLocalUser.nombre,
        rut: currentLocalUser.rut || "",
        fechaRegistro: currentLocalUser.fechaRegistro || new Date().toISOString(),
        quizzesCompletados: localQuizzesFinished,
        puntos: 0,
        porcentaje: 0,
        respuestas: localRespuestasAcumuladas,
        esActivo: localQuizzesFinished > 0
      };
      mapParticipantes.set(localKey, part);
    } else {
      if (localQuizzesFinished > part.quizzesCompletados) {
        part.quizzesCompletados = localQuizzesFinished;
        part.esActivo = true;
      }
    }

    if (localQuizzesFinished > 0) {
      let totQ = 0;
      let totC = 0;
      Object.keys(localRespuestasAcumuladas).forEach((qKey) => {
        const qData = localRespuestasAcumuladas[qKey];
        if (qData && qData.preguntas) {
          qData.preguntas.forEach((item) => {
            totQ++;
            if (item.esCorrecta) totC++;
          });
        }
      });
      if (totQ > 0) {
        const pct = Math.round((totC / totQ) * 100);
        if (totC > part.puntos) part.puntos = totC;
        if (pct > part.porcentaje) part.porcentaje = pct;
      }
    }
  }

  // 4. Convertir a Array y Ordenar con las Reglas Estrictas del Ranking
  const rankingList = Array.from(mapParticipantes.values());

  rankingList.sort((a, b) => {
    // 1. Mayor cantidad de quizzes completados
    if (b.quizzesCompletados !== a.quizzesCompletados) {
      return b.quizzesCompletados - a.quizzesCompletados;
    }
    // 2. Mayor puntuación acumulada (aciertos)
    if (b.puntos !== a.puntos) {
      return b.puntos - a.puntos;
    }
    // 3. Mayor porcentaje promedio de respuestas correctas
    if (b.porcentaje !== a.porcentaje) {
      return b.porcentaje - a.porcentaje;
    }
    // 4. Desempate alfabético
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  // Asignar posición y calcular deltas de movimiento en vivo
  rankingList.forEach((p, idx) => {
    const newPos = idx + 1;
    p.posicion = newPos;
    const keyId = (p.rut || p.id || p.nombre).trim();

    if (!isFirstRankingRender && rankingPreviousPositions.has(keyId)) {
      const prevPos = rankingPreviousPositions.get(keyId);
      p.delta = prevPos - newPos; // Positivo = Subió puestos, Negativo = Bajó puestos
    } else {
      p.delta = 0;
    }
  });

  // Guardar mapa de posiciones para el siguiente render en vivo
  const nextPositionsMap = new Map();
  rankingList.forEach((p) => {
    const keyId = (p.rut || p.id || p.nombre).trim();
    nextPositionsMap.set(keyId, p.posicion);
  });
  rankingPreviousPositions = nextPositionsMap;
  isFirstRankingRender = false;

  // 5. Actualizar Hero CTA Button
  if (heroComenzarBtn) {
    const savedProg = currentLocalUser ? obtenerProgresoGuardado(currentLocalUser.rut) : null;
    if (currentLocalUser && savedProg && (savedProg.indiceQuiz > 0 || savedProg.indicePregunta > 0)) {
      heroComenzarBtn.innerHTML = `
        <span>Continuar Módulo ${savedProg.indiceQuiz + 1} (Pregunta ${savedProg.indicePregunta + 1})</span>
        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
      heroComenzarBtn.href = "quiz.html";
    } else if (currentLocalUser) {
      heroComenzarBtn.innerHTML = `
        <span>Continuar Capacitación</span>
        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
      heroComenzarBtn.href = "quiz.html";
    } else {
      heroComenzarBtn.innerHTML = `
        <span>Comenzar Capacitación</span>
        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
      heroComenzarBtn.href = "registro.html";
    }
  }

  // 6. Renderizar RANKING DINÁMICO (Nuevo Contenedor Principal)
  if (rankingLiveList) {
    const term = (homeState.searchTerm || "").toLowerCase().trim();
    const filteredList = rankingList.filter((p) => {
      if (!term) return true;
      return (
        (p.nombre && p.nombre.toLowerCase().includes(term)) ||
        (p.rut && p.rut.toLowerCase().includes(term))
      );
    });

    if (filteredList.length === 0) {
      if (term) {
        rankingLiveList.innerHTML = `
          <div style="text-align: center; padding: 3.5rem 1.5rem; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: 16px;">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔍</div>
            <p style="font-weight: 800; font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.25rem;">
              No se encontraron participantes para "${escapeHtml(term)}"
            </p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">Prueba buscando por otro nombre o RUT.</p>
          </div>
        `;
      } else {
        rankingLiveList.innerHTML = `
          <div style="text-align: center; padding: 3.5rem 1.5rem; background: #ffffff; border: 2px dashed #fed7aa; border-radius: 16px;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">🏆</div>
            <p style="font-weight: 900; font-size: 1.25rem; color: var(--text-main); margin-bottom: 0.5rem;">
              ¡El Marcador de Seguridad está Abierto!
            </p>
            <p style="font-size: 0.95rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.5rem auto;">
              Sé el primer prevencionista en completar los módulos e inaugurar el 1° Lugar del podio de CODELCO.
            </p>
            <a href="registro.html" class="btn-hero-primary" style="padding: 0.85rem 1.8rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 800; border-radius: 10px;">
              <span>Comenzar Ahora</span>
            </a>
          </div>
        `;
      }
    } else {
      const currentRut = currentLocalUser?.rut?.trim();
      let htmlCards = "";

      filteredList.forEach((p) => {
        const esUsuarioActual = currentRut && p.rut && p.rut.trim() === currentRut;
        const frase = obtenerFraseDinamica(p, p.posicion, rankingList.length, totalQuizzesCount);
        const pctProgreso = Math.round((p.quizzesCompletados / totalQuizzesCount) * 100);

        // Estilos de puesto
        let cardExtraClass = "";
        let numBadgeHtml = "";

        if (p.posicion === 1) {
          cardExtraClass = "rank-top-1";
          numBadgeHtml = `<div class="ranking-num-badge badge-gold">🥇</div>`;
        } else if (p.posicion === 2) {
          cardExtraClass = "rank-top-2";
          numBadgeHtml = `<div class="ranking-num-badge badge-silver">🥈</div>`;
        } else if (p.posicion === 3) {
          cardExtraClass = "rank-top-3";
          numBadgeHtml = `<div class="ranking-num-badge badge-bronze">🥉</div>`;
        } else {
          numBadgeHtml = `<div class="ranking-num-badge">#${p.posicion}</div>`;
        }

        if (esUsuarioActual) {
          cardExtraClass += " is-current-user";
        }

        // Insignia de delta de movimiento
        let deltaBadgeHtml = "";
        if (p.delta > 0) {
          deltaBadgeHtml = `<span class="rank-delta-badge up">↑ SUBIÓ ${p.delta} ${p.delta === 1 ? 'PUESTO' : 'PUESTOS'}</span>`;
        } else if (p.delta < 0) {
          const absDelta = Math.abs(p.delta);
          deltaBadgeHtml = `<span class="rank-delta-badge down">↓ BAJÓ ${absDelta} ${absDelta === 1 ? 'PUESTO' : 'PUESTOS'}</span>`;
        }

        const inicial = (p.nombre || "U").charAt(0).toUpperCase();

        htmlCards += `
          <div class="ranking-live-card ${cardExtraClass}">
            <!-- Columna Izquierda: Posición, Avatar y Datos -->
            <div class="ranking-player-col">
              ${numBadgeHtml}

              <div class="ranking-avatar">
                ${escapeHtml(inicial)}
              </div>

              <div class="ranking-name-wrapper">
                <div class="ranking-name-row">
                  <span class="ranking-player-name">${escapeHtml(p.nombre)}</span>
                  ${esUsuarioActual ? '<span class="current-user-tag">ESTÁS AQUÍ ↑</span>' : ''}
                  ${deltaBadgeHtml}
                </div>
                <div class="ranking-quote">
                  "${escapeHtml(frase)}"
                </div>
              </div>
            </div>

            <!-- Columna Derecha: Métricas en Vivo -->
            <div class="ranking-metrics-col">
              <div class="metric-pill-item">
                <span class="metric-pill-label">QUIZZES</span>
                <span class="metric-pill-val">${p.quizzesCompletados}/${totalQuizzesCount}</span>
                <div class="ranking-progress-bar-track">
                  <div class="ranking-progress-bar-fill" style="width: ${pctProgreso}%;"></div>
                </div>
              </div>

              <div class="metric-pill-item">
                <span class="metric-pill-label">PUNTOS</span>
                <span class="metric-pill-val accent">${p.puntos} PTS</span>
              </div>

              <div class="metric-pill-item">
                <span class="metric-pill-label">RENDIMIENTO</span>
                <span class="metric-pill-val success">${p.porcentaje}%</span>
              </div>
            </div>
          </div>
        `;
      });

      rankingLiveList.innerHTML = htmlCards;
    }
  }

  // Compatibilidad legacy si existen elementos en el DOM
  if (podiumContainer) podiumContainer.innerHTML = "";
  if (rankingTableBody) rankingTableBody.innerHTML = "";
}

// Devuelve frases dinámicas y divertidas orientadas al esfuerzo y competencia en seguridad
function obtenerFraseDinamica(part, posicion, totalParticipantes, totalQuizzes) {
  if (!part) return "";

  if (posicion === 1) {
    if (part.quizzesCompletados >= totalQuizzes && part.porcentaje >= 90) {
      return "El casco de oro está ocupado. Rendimiento impecable en todos los módulos.";
    }
    return "El casco de oro está ocupado. Lidera el turno con paso firme.";
  }

  if (posicion === 2) {
    return "Le está respirando en la nuca al primer lugar. ¡Un quiz más y sube de puesto!";
  }

  if (posicion === 3) {
    return "Guardia de la seguridad en el podio. El primer lugar no se entrega solo.";
  }

  if (part.quizzesCompletados >= totalQuizzes) {
    return "Capacitación 100% completada. Seguridad garantizada en la faena.";
  }

  if (part.quizzesCompletados >= 2) {
    return "Está haciendo horas extra en los quizzes. Va directo por el turno estelar.";
  }

  return "El café puede esperar, este quiz no. Cada acierto suma al turno.";
}

// Asigna rangos y descripciones con humor sano y corporativo para compatibilidad
function obtenerRangoSeguridad(porcentaje) {
  if (porcentaje === 100) {
    return {
      titulo: "El Maestro de la Seguridad",
      humor: "Inmune a los descuidos cotidianos. Su sola presencia eleva el estándar preventivo del turno a la excelencia."
    };
  } else if (porcentaje >= 85) {
    return {
      titulo: "Experto en Prevención",
      humor: "Capaz de anticipar cualquier peligro operacional. Domina los protocolos con precisión minera."
    };
  } else if (porcentaje >= 60) {
    return {
      titulo: "Guardia de la Seguridad",
      humor: "Cumple las reglas preventivas y cuida a sus compañeros en cada etapa del turno."
    };
  } else {
    return {
      titulo: "Prevencionista en Formación",
      humor: "Tomando ritmo en la capacitación. Un repaso más y alcanzará el podio de seguridad."
    };
  }
}

// Compatibilidad con páginas legacy si llaman a initHonorRoll
function initHonorRoll() {
  initHomePage();
}

/* ==========================================================================
   SISTEMA DE AUTOGUARDADO Y RECUPERACIÓN DE EVALUACIÓN
   ========================================================================== */

function getProgresoStorageKey(rut) {
  const cleanRut = (rut || "anon").trim().replace(/[^a-zA-Z0-9]/g, "");
  return `codelco_quiz_progreso_${cleanRut}`;
}

function guardarProgresoLocal(indiceQuiz, indicePregunta, respuestasQuiz, respuestasAcum) {
  if (!participanteActual || !participanteActual.rut) return;

  const quizKey = QUIZ_SECUENCIA[indiceQuiz] || "quiz_1";
  const progresoData = {
    rut: participanteActual.rut,
    nombre: participanteActual.nombre,
    indiceQuiz: indiceQuiz,
    quizKey: quizKey,
    indicePregunta: indicePregunta,
    respuestasQuiz: respuestasQuiz || [],
    respuestasAcumuladas: respuestasAcum || {},
    timestamp: Date.now()
  };

  try {
    const key = getProgresoStorageKey(participanteActual.rut);
    localStorage.setItem(key, JSON.stringify(progresoData));
    localStorage.setItem("quiz_secuencia_index", indiceQuiz.toString());
    localStorage.setItem("respuestas_acumuladas", JSON.stringify(respuestasAcum || {}));
  } catch (e) {
    console.error("Error guardando progreso local:", e);
  }
}

function obtenerProgresoGuardado(rut) {
  if (!rut) return null;
  try {
    const key = getProgresoStorageKey(rut);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data;
  } catch (e) {
    console.error("Error obteniendo progreso guardado:", e);
    return null;
  }
}

function limpiarProgresoLocal(rut) {
  if (!rut) return;
  try {
    const key = getProgresoStorageKey(rut);
    localStorage.removeItem(key);
    localStorage.removeItem("quiz_secuencia_index");
    localStorage.removeItem("respuestas_acumuladas");
  } catch (e) {
    console.error("Error limpiando progreso local:", e);
  }
}

/* ==========================================================================
   2. PÁGINA QUIZ - SECUENCIA AUTOMÁTICA DE EVALUACIONES (TEXT QUIZ)
   ========================================================================== */
let participanteActual = null;
let indiceQuizActual = 0;
let quizDataActual = null;
let respuestasAcumuladas = {};

let indicePreguntaActual = 0;
let preguntasQuizActual = [];
let respuestasQuizActual = [];
let respondidoActivo = false;

async function initQuizPage(formQuiz) {
  // 1. Obtener participante de localStorage
  const rawParticipante = localStorage.getItem("participante_actual");
  if (!rawParticipante) {
    window.location.href = "index.html";
    return;
  }

  try {
    participanteActual = JSON.parse(rawParticipante);
  } catch (e) {
    window.location.href = "index.html";
    return;
  }

  // Mostrar distintivo en el header
  const badge = document.getElementById("participant-badge");
  if (badge) {
    badge.textContent = `${participanteActual.nombre} (${participanteActual.rut})`;
  }

  // Escuchar botón de reinicio
  const btnNueva = document.getElementById("btn-nueva-capacitacion");
  if (btnNueva) {
    btnNueva.addEventListener("click", () => {
      limpiarProgresoLocal(participanteActual.rut);
      localStorage.removeItem("participante_id");
      localStorage.removeItem("participante_actual");
    });
  }

  // Escuchar envío del formulario de quiz
  if (formQuiz) {
    formQuiz.addEventListener("submit", (e) => e.preventDefault());
  }

  // 2. Verificar si existe progreso guardado en localStorage para reanudar
  const savedProg = obtenerProgresoGuardado(participanteActual.rut);
  const modalResume = document.getElementById("modal-resume-quiz");
  const resumeDesc = document.getElementById("resume-modal-desc");
  const btnResumeContinue = document.getElementById("btn-resume-continue");
  const btnResumeRestart = document.getElementById("btn-resume-restart");

  const hasIncompleteProgress = savedProg && (
    savedProg.indiceQuiz > 0 ||
    savedProg.indicePregunta > 0 ||
    (savedProg.respuestasQuiz && savedProg.respuestasQuiz.length > 0) ||
    (savedProg.respuestasAcumuladas && Object.keys(savedProg.respuestasAcumuladas).length > 0)
  );

  if (hasIncompleteProgress && modalResume) {
    const qNum = (savedProg.indiceQuiz || 0) + 1;
    const pNum = (savedProg.indicePregunta || 0) + 1;
    if (resumeDesc) {
      resumeDesc.innerHTML = `Detectamos un avance guardado en el <strong>Módulo ${qNum} (Pregunta ${pNum})</strong> para <strong>${escapeHtml(participanteActual.nombre)}</strong>.<br><br>¿Deseas continuar exactamente donde lo dejaste o comenzar desde el inicio?`;
    }

    modalResume.style.display = "flex";

    if (btnResumeContinue) {
      btnResumeContinue.onclick = async () => {
        modalResume.style.display = "none";
        indiceQuizActual = savedProg.indiceQuiz || 0;
        indicePreguntaActual = savedProg.indicePregunta || 0;
        respuestasQuizActual = savedProg.respuestasQuiz || [];
        respuestasAcumuladas = savedProg.respuestasAcumuladas || {};
        await cargarQuizFirebase(true);
      };
    }

    if (btnResumeRestart) {
      btnResumeRestart.onclick = async () => {
        modalResume.style.display = "none";
        limpiarProgresoLocal(participanteActual.rut);
        indiceQuizActual = 0;
        indicePreguntaActual = 0;
        respuestasQuizActual = [];
        respuestasAcumuladas = {};
        await cargarQuizFirebase(false);
      };
    }
  } else {
    // Si no hay modal o no hay progreso incompleto, inicializar normalmente
    const savedIndex = localStorage.getItem("quiz_secuencia_index");
    indiceQuizActual = savedIndex ? parseInt(savedIndex, 10) : 0;

    const savedRespuestas = localStorage.getItem("respuestas_acumuladas");
    if (savedRespuestas) {
      try { respuestasAcumuladas = JSON.parse(savedRespuestas); } catch (e) { respuestasAcumuladas = {}; }
    }

    await cargarQuizFirebase(false);
  }
}

// Cargar datos de la evaluación activa desde Firebase Realtime Database
async function cargarQuizFirebase(isResuming = false) {
  const alertQuiz = document.getElementById("alert-quiz");
  if (alertQuiz) alertQuiz.style.display = "none";

  actualizarPasosGrafico();

  const quizKey = QUIZ_SECUENCIA[indiceQuizActual];
  
  const titleElem = document.getElementById("quiz-title");
  const descElem = document.getElementById("quiz-description");
  const questionsContainer = document.getElementById("questions-container");

  if (titleElem) titleElem.textContent = "Cargando Módulo " + (QUIZ_TITULOS[quizKey] || quizKey) + "...";
  if (questionsContainer) {
    questionsContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div class="sbl-spinner" style="margin: 0 auto 1rem auto; width: 40px; height: 40px; border: 4px solid #fed7aa; border-top-color: #ea580c; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="font-weight: 600;">Cargando preguntas desde Firebase...</p>
      </div>
    `;
  }

  try {
    const quizSnapshot = await get(ref(db, `quizzes/${quizKey}`));

    if (!quizSnapshot.exists()) {
      throw new Error(`El quiz ${quizKey} no existe en Firebase RTDB.`);
    }

    quizDataActual = quizSnapshot.val();
    
    // Configurar secuencia de preguntas del quiz activo
    preguntasQuizActual = parsePreguntasArray(quizDataActual.preguntas);
    
    if (!isResuming) {
      indicePreguntaActual = 0;
      respuestasQuizActual = [];
    }

    // Si el índice actual guardado excede el número de preguntas, resetear al rango
    if (indicePreguntaActual >= preguntasQuizActual.length && preguntasQuizActual.length > 0) {
      indicePreguntaActual = 0;
      respuestasQuizActual = [];
    }

    respondidoActivo = false;

    if (preguntasQuizActual.length === 0) {
      if (questionsContainer) {
        questionsContainer.innerHTML = `
          <div class="alert alert-danger" style="margin: 1.5rem 0;">
            No se encontraron preguntas registradas en Firebase para este módulo.
          </div>
        `;
      }
      return;
    }

    // Renderizar la pregunta activa
    renderizarPregunta();

  } catch (error) {
    console.error("Error leyendo quiz de Firebase:", error);
    if (questionsContainer) {
      questionsContainer.innerHTML = `
        <div class="alert alert-danger" style="margin: 1.5rem 0;">
          Error de conexión a Firebase. No se pudieron obtener las preguntas del quiz.
        </div>
      `;
    }
  }
}

// Actualizar barra gráfica de progreso
function actualizarPasosGrafico() {
  QUIZ_SECUENCIA.forEach((key, idx) => {
    const stepElem = document.getElementById(`step-${idx}`);
    if (!stepElem) return;

    stepElem.classList.remove("active", "completed");
    if (idx < indiceQuizActual) {
      stepElem.classList.add("completed");
    } else if (idx === indiceQuizActual) {
      stepElem.classList.add("active");
    }
  });
}

// Renderizar la pregunta activa en formato texto puro interactivo
function renderizarPregunta() {
  const questionsContainer = document.getElementById("questions-container");
  if (!questionsContainer) return;

  // Ocultar botón Siguiente global
  const mainNextBtn = document.getElementById("btn-next-quiz");
  if (mainNextBtn) mainNextBtn.style.display = "none";

  const q = preguntasQuizActual[indicePreguntaActual];
  const totalPreguntas = preguntasQuizActual.length;
  respondidoActivo = false;

  // Actualizar subtítulos e indicadores en la página
  const titleElem = document.getElementById("quiz-title");
  const descElem = document.getElementById("quiz-description");
  if (titleElem) titleElem.textContent = `${quizDataActual.titulo || QUIZ_TITULOS[QUIZ_SECUENCIA[indiceQuizActual]]}`;
  if (descElem) descElem.textContent = quizDataActual.descripcion || "Seleccione la respuesta más segura y adecuada.";

  const opciones = q.opciones || [];
  const letras = ["A", "B", "C", "D", "E", "F"];

  questionsContainer.innerHTML = `
    <div class="quiz-question-wrapper" style="animation: fadeIn 0.3s ease;">
      <!-- Cabecera de la pregunta -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
        <span style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background-color: rgba(234, 88, 12, 0.12); color: #ea580c; padding: 0.35rem 0.85rem; border-radius: 9999px;">
          Pregunta ${indicePreguntaActual + 1} de ${totalPreguntas}
        </span>
        <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">
          Módulo ${indiceQuizActual + 1} de ${QUIZ_SECUENCIA.length}
        </span>
      </div>

      <!-- Enunciado de la Pregunta -->
      <div style="background-color: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-sm);">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); line-height: 1.5; margin: 0;">
          ${escapeHtml(q.pregunta || q.texto || "")}
        </h2>
      </div>

      <!-- Listado de Opciones -->
      <div class="quiz-options-container" style="display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1.5rem;">
        ${opciones.map((opt, optIdx) => `
          <button type="button" class="quiz-opt-btn" data-index="${optIdx}" style="
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            width: 100%;
            text-align: left;
            padding: 1.15rem 1.25rem;
            background-color: var(--surface-color);
            border: 2px solid var(--border-color);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            color: var(--text-main);
            font-size: 0.98rem;
            line-height: 1.45;
          ">
            <span class="quiz-opt-letter" style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: 32px;
              height: 32px;
              flex-shrink: 0;
              border-radius: 50%;
              background-color: rgba(0, 0, 0, 0.05);
              font-weight: 800;
              color: var(--text-main);
              font-size: 0.9rem;
            ">${letras[optIdx] || optIdx + 1}</span>
            <span class="quiz-opt-text" style="flex: 1; padding-top: 0.2rem; font-weight: 500;">${escapeHtml(opt)}</span>
          </button>
        `).join("")}
      </div>

      <!-- Contenedor dinámico de retroalimentación inmediata -->
      <div id="quiz-feedback-box" style="display: none; margin-bottom: 1.5rem;"></div>
    </div>
  `;

  // Asignar eventos a las opciones
  const optButtons = questionsContainer.querySelectorAll(".quiz-opt-btn");
  optButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (respondidoActivo) return;
      const idx = parseInt(btn.getAttribute("data-index"), 10);
      procesarRespuestaPregunta(idx);
    });

    btn.addEventListener("mouseenter", () => {
      if (!respondidoActivo) {
        btn.style.borderColor = "#ea580c";
        btn.style.backgroundColor = "rgba(234, 88, 12, 0.04)";
      }
    });

    btn.addEventListener("mouseleave", () => {
      if (!respondidoActivo) {
        btn.style.borderColor = "var(--border-color)";
        btn.style.backgroundColor = "var(--surface-color)";
      }
    });
  });
}

// Procesa la respuesta elegida, muestra retroalimentación y habilita botón siguiente
function procesarRespuestaPregunta(optIdxSeleccionado) {
  if (respondidoActivo) return;
  respondidoActivo = true;

  const q = preguntasQuizActual[indicePreguntaActual];
  const totalPreguntas = preguntasQuizActual.length;
  const optTextoSeleccionado = q.opciones[optIdxSeleccionado];

  const { correctIndex, correctText } = resolverCorrecta(q);
  const esCorrecta = (optIdxSeleccionado === correctIndex) || (optTextoSeleccionado === correctText);

  // Obtener explicación / retroalimentación directamente desde Firebase (soporta 'retroalimentacion', 'explicacion', etc.)
  const explicacion = q.retroalimentacion || 
                      q.retroalimentación || 
                      q.explicacion || 
                      q.explicación || 
                      q.feedback || 
                      q.justificacion || 
                      q.justificación || 
                      (esCorrecta ? "Cumple con las normas y protocolos preventivos de CODELCO." : "Debe extremarse la precaución según los protocolos de CODELCO.");

  // Registrar respuesta
  respuestasQuizActual.push({
    pregunta: q.pregunta || q.texto || "",
    respuestaTrabajador: optTextoSeleccionado,
    respuestaCorrecta: correctText,
    esCorrecta: esCorrecta,
    retroalimentacion: explicacion
  });

  // Guardar inmediatamente el progreso en LocalStorage para no perder avances
  guardarProgresoLocal(indiceQuizActual, indicePreguntaActual, respuestasQuizActual, respuestasAcumuladas);

  // Resaltar visualmente las opciones
  const optButtons = document.querySelectorAll(".quiz-opt-btn");
  optButtons.forEach((btn, idx) => {
    btn.style.cursor = "default";
    const letterSpan = btn.querySelector(".quiz-opt-letter");
    
    if (idx === correctIndex || (q.opciones[idx] === correctText)) {
      // Opción correcta en Verde
      btn.style.borderColor = "#15803d";
      btn.style.backgroundColor = "rgba(21, 128, 61, 0.08)";
      if (letterSpan) {
        letterSpan.style.backgroundColor = "#15803d";
        letterSpan.style.color = "#ffffff";
      }
    } else if (idx === optIdxSeleccionado && !esCorrecta) {
      // Opción incorrecta en Rojo
      btn.style.borderColor = "#b91c1c";
      btn.style.backgroundColor = "rgba(185, 28, 28, 0.08)";
      if (letterSpan) {
        letterSpan.style.backgroundColor = "#b91c1c";
        letterSpan.style.color = "#ffffff";
      }
    } else {
      btn.style.opacity = "0.6";
    }
  });

  // Mostrar panel de retroalimentación
  const feedbackBox = document.getElementById("quiz-feedback-box");
  if (feedbackBox) {
    const esUltimaPreguntaModulo = (indicePreguntaActual + 1 >= totalPreguntas);
    const esUltimoModulo = (indiceQuizActual >= QUIZ_SECUENCIA.length - 1);
    
    let btnTexto = "Siguiente Pregunta →";
    if (esUltimaPreguntaModulo) {
      btnTexto = esUltimoModulo ? "Finalizar Capacitación y Ver Resultados →" : "Completar Módulo y Continuar →";
    }

    const colorFondo = esCorrecta ? "rgba(21, 128, 61, 0.08)" : "rgba(185, 28, 28, 0.08)";
    const colorBorde = esCorrecta ? "#15803d" : "#b91c1c";
    const colorTexto = esCorrecta ? "#15803d" : "#b91c1c";
    const icono = esCorrecta ? "✓" : "✗";
    const titulo = esCorrecta ? "¡Respuesta Correcta!" : "Respuesta Incorrecta";

    feedbackBox.style.display = "block";
    feedbackBox.innerHTML = `
      <div style="
        background-color: ${colorFondo};
        border: 2px solid ${colorBorde};
        border-radius: 12px;
        padding: 1.5rem;
        animation: fadeIn 0.3s ease;
      ">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
          <span style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: ${colorBorde};
            color: #ffffff;
            font-weight: 900;
            font-size: 1rem;
          ">${icono}</span>
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: ${colorTexto};">
            ${titulo}
          </h3>
        </div>
        
        <p style="margin: 0 0 1.25rem 0; font-size: 0.95rem; color: var(--text-main); line-height: 1.5;">
          ${escapeHtml(explicacion)}
        </p>

        <div style="display: flex; justify-content: flex-end;">
          <button type="button" id="btn-siguiente-accion" class="btn btn-primary" style="
            padding: 0.85rem 1.85rem;
            font-size: 0.98rem;
            font-weight: 700;
            border-radius: 8px;
          ">
            ${btnTexto}
          </button>
        </div>
      </div>
    `;

    const btnSiguiente = document.getElementById("btn-siguiente-accion");
    if (btnSiguiente) {
      btnSiguiente.addEventListener("click", avanzarSiguientePregunta);
    }
  }
}

// Avanzar a la siguiente pregunta o finalizar el módulo
async function avanzarSiguientePregunta() {
  indicePreguntaActual++;

  if (indicePreguntaActual < preguntasQuizActual.length) {
    guardarProgresoLocal(indiceQuizActual, indicePreguntaActual, respuestasQuizActual, respuestasAcumuladas);
    renderizarPregunta();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    // Registrar respuestas acumuladas del módulo
    const quizKey = QUIZ_SECUENCIA[indiceQuizActual];
    respuestasAcumuladas[quizKey] = {
      titulo: quizDataActual.titulo || QUIZ_TITULOS[quizKey],
      preguntas: respuestasQuizActual
    };

    localStorage.setItem("respuestas_acumuladas", JSON.stringify(respuestasAcumuladas));

    if (indiceQuizActual < QUIZ_SECUENCIA.length - 1) {
      // Guardar que el siguiente módulo es el que viene
      guardarProgresoLocal(indiceQuizActual + 1, 0, [], respuestasAcumuladas);
      mostrarPantallaFinModulo();
    } else {
      await guardarResultadoFinalUnico();
    }
  }
}

// Pantalla de finalización de módulo antes de pasar al siguiente
function mostrarPantallaFinModulo() {
  const questionsContainer = document.getElementById("questions-container");
  if (!questionsContainer) return;

  const quizKey = QUIZ_SECUENCIA[indiceQuizActual];
  const tituloModulo = quizDataActual.titulo || QUIZ_TITULOS[quizKey];
  let correctasEnModulo = 0;
  respuestasQuizActual.forEach(p => { if (p.esCorrecta) correctasEnModulo++; });
  const totalModulo = respuestasQuizActual.length;

  questionsContainer.innerHTML = `
    <div style="text-align: center; padding: 3rem 2rem; background-color: var(--surface-color); border: 2px solid #ea580c; border-radius: 12px; box-shadow: var(--shadow-md); animation: fadeIn 0.3s ease;">
      <div style="font-size: 3.5rem; margin-bottom: 1rem;">🏁</div>
      <h2 style="font-size: 1.5rem; font-weight: 900; color: var(--text-main); margin-bottom: 0.5rem; text-transform: uppercase;">Módulo Completado</h2>
      <p style="font-size: 1rem; color: var(--text-muted); line-height: 1.5; max-width: 550px; margin: 0 auto 1.25rem auto;">
        Ha completado todas las preguntas del módulo <strong>"${escapeHtml(tituloModulo)}"</strong>.
      </p>

      <div style="display: inline-block; background-color: rgba(234, 88, 12, 0.08); border: 1px solid rgba(234, 88, 12, 0.2); border-radius: 8px; padding: 0.75rem 1.5rem; margin-bottom: 2rem;">
        <span style="font-weight: 700; color: #ea580c; font-size: 1.05rem;">
          Aciertos en este módulo: ${correctasEnModulo} de ${totalModulo}
        </span>
      </div>

      <div>
        <button type="button" id="btn-next-module-trans" class="btn btn-primary" style="padding: 1rem 2.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px;">
          CONTINUAR AL SIGUIENTE MÓDULO &rarr;
        </button>
      </div>
    </div>
  `;

  const nextBtn = document.getElementById("btn-next-module-trans");
  if (nextBtn) {
    nextBtn.addEventListener("click", comenzarSiguienteModulo);
  }
}

async function comenzarSiguienteModulo() {
  indiceQuizActual++;
  localStorage.setItem("quiz_secuencia_index", indiceQuizActual.toString());
  guardarProgresoLocal(indiceQuizActual, 0, [], respuestasAcumuladas);
  window.scrollTo({ top: 0, behavior: "smooth" });
  await cargarQuizFirebase(false);
}

// Guardar el registro único en el nodo 'resultados' de Firebase RTDB
async function guardarResultadoFinalUnico() {
  const btnNext = document.getElementById("btn-next-quiz");
  if (btnNext) {
    btnNext.disabled = true;
    btnNext.textContent = "Guardando Resultados en Firebase...";
  }

  let totalPreguntas = 0;
  let totalCorrectas = 0;
  let totalIncorrectas = 0;

  Object.keys(respuestasAcumuladas).forEach((key) => {
    const quizObj = respuestasAcumuladas[key];
    if (quizObj && quizObj.preguntas) {
      quizObj.preguntas.forEach((p) => {
        totalPreguntas++;
        if (p.esCorrecta) {
          totalCorrectas++;
        } else {
          totalIncorrectas++;
        }
      });
    }
  });

  const porcentaje = totalPreguntas > 0 ? Math.round((totalCorrectas / totalPreguntas) * 100) : 0;
  const estado = porcentaje >= 60 ? "Aprobado" : "Reprobado";

  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const horaStr = ahora.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const resultadoDocumento = {
    nombre: participanteActual.nombre,
    rut: participanteActual.rut,
    fecha: fechaStr,
    hora: horaStr,
    respuestas: respuestasAcumuladas,
    correctas: totalCorrectas,
    incorrectas: totalIncorrectas,
    porcentaje: porcentaje,
    estado: estado
  };

  try {
    // Guardar en el nodo 'resultados' en Firebase Realtime Database
    const resultadosRef = ref(db, "resultados");
    const nuevoResultadoRef = push(resultadosRef);
    await set(nuevoResultadoRef, resultadoDocumento);

    console.log("Registro guardado exitosamente en Firebase RTDB con ID:", nuevoResultadoRef.key);

    // Limpiar progreso temporal guardado en localStorage tras finalización con éxito
    limpiarProgresoLocal(participanteActual.rut);

    mostrarResultadoPantallaFinal(resultadoDocumento, totalPreguntas);

  } catch (error) {
    console.error("Error al guardar registro único en Firebase:", error);
    alert("Ocurrió un error al guardar los resultados en Firebase. Se mostrará el resumen en pantalla.");
    limpiarProgresoLocal(participanteActual.rut);
    mostrarResultadoPantallaFinal(resultadoDocumento, totalPreguntas);
  }
}

// Mostrar pantalla de finalización
function mostrarResultadoPantallaFinal(res, totalPreguntas) {
  document.body.classList.remove("sbl-cinema-mode");
  const quizCard = document.getElementById("quiz-card");
  const stepsBar = document.getElementById("steps-bar");
  const resultCard = document.getElementById("result-card");

  if (quizCard) quizCard.style.display = "none";
  if (stepsBar) stepsBar.style.display = "none";
  if (resultCard) resultCard.style.display = "block";

  document.getElementById("res-nombre").textContent = res.nombre;
  document.getElementById("res-rut").textContent = res.rut;
  document.getElementById("res-porcentaje").textContent = `${res.porcentaje}%`;

  const elemEstado = document.getElementById("res-estado");
  if (elemEstado) {
    elemEstado.textContent = res.estado;
    elemEstado.className = "summary-value badge " + (res.estado === "Aprobado" ? "badge-success" : "badge-danger");
  }

  document.getElementById("res-correctas").textContent = `${res.correctas} de ${totalPreguntas}`;
  document.getElementById("res-fechahora").textContent = `${res.fecha} - ${res.hora}`;

  const iconElem = document.getElementById("result-icon");
  const titleElem = document.getElementById("result-title");
  const subElem = document.getElementById("result-subtitle");

  if (res.estado === "Aprobado") {
    if (iconElem) iconElem.textContent = "🎉";
    if (titleElem) titleElem.textContent = "¡Capacitación Aprobada!";
    if (subElem) subElem.textContent = `Ha alcanzado un ${res.porcentaje}% de rendimiento, superando el mínimo del 60%.`;
  } else {
    if (iconElem) iconElem.textContent = "⚠️";
    if (titleElem) titleElem.textContent = "Capacitación Reprobada";
    if (subElem) subElem.textContent = `Obtuvo un ${res.porcentaje}%. Requiere un mínimo de 60% para aprobar.`;
  }

  // Limpiar progreso de sesión
  localStorage.removeItem("quiz_secuencia_index");
  localStorage.removeItem("respuestas_acumuladas");
}

/* ==========================================================================
   3. PÁGINA DASHBOARD ESTUDIANTE - LECTURA EN TIEMPO REAL DESDE FIREBASE
   ========================================================================== */
let todosLosResultados = [];
let editorPreguntasActuales = [];
let quizEditorActivo = "quiz1";

function initDashboardPage(tbody) {
  const resultadosRef = ref(db, "resultados");

  onValue(resultadosRef, (snapshot) => {
    const data = snapshot.val();
    todosLosResultados = [];

    if (data) {
      todosLosResultados = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));

      // Ordenar por fecha y hora más reciente
      todosLosResultados.reverse();
    }

    renderizarTablaDashboard(tbody, todosLosResultados);
  }, (error) => {
    console.error("Error leyendo resultados de Firebase RTDB:", error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--danger); padding: 2rem;">
          Error al conectar con Firebase Realtime Database.
        </td>
      </tr>
    `;
  });

  // Escuchar filtros
  const searchInput = document.getElementById("search-input");
  const filterEstado = document.getElementById("filter-estado");

  const aplicarFiltros = () => {
    const query = (searchInput?.value || "").toLowerCase().trim();
    const estadoVal = filterEstado?.value || "";

    const filtrados = todosLosResultados.filter(item => {
      const matchNombre = (item.nombre || "").toLowerCase().includes(query);
      const matchRut = (item.rut || "").toLowerCase().includes(query);
      const matchQuery = !query || matchNombre || matchRut;
      const matchEstado = !estadoVal || item.estado === estadoVal;

      return matchQuery && matchEstado;
    });

    renderizarTablaDashboard(tbody, filtrados);
  };

  if (searchInput) searchInput.addEventListener("input", aplicarFiltros);
  if (filterEstado) filterEstado.addEventListener("change", aplicarFiltros);

  // Cerrar modal
  setupModalCloseHandlers();
}

// Renderizar filas de la tabla del Dashboard Estudiante
function renderizarTablaDashboard(tbody, lista) {
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <p style="font-weight: 600; font-size: 1.1rem; color: var(--text-main);">No hay resultados registrados.</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">
              Complete una capacitación desde la página de inicio para ver los registros aquí.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map((res) => {
    const badgeClass = res.estado === "Aprobado" ? "badge-success" : "badge-danger";

    return `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(res.nombre || "-")}</td>
        <td>${escapeHtml(res.rut || "-")}</td>
        <td>${escapeHtml(res.fecha || "-")} <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(res.hora || "")}</span></td>
        <td style="font-weight: 700; color: var(--primary);">${res.porcentaje !== undefined ? res.porcentaje : 0}%</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(res.estado || "-")}</span></td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-ver-detalle" data-id="${res.id}" style="padding: 0.35rem 0.85rem; font-size: 0.85rem;">
            Ver
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const btnsVer = tbody.querySelectorAll(".btn-ver-detalle");
  btnsVer.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      abrirModalDetalle(id);
    });
  });
}

/* ==========================================================================
   4. DASHBOARD DEL PROFESOR - MÉTRICAS, TORTA, RENDIMIENTO Y EDITOR
   ========================================================================== */
function initProfesorPage() {
  const resultadosRef = ref(db, "resultados");

  onValue(resultadosRef, (snapshot) => {
    const data = snapshot.val();
    let lista = [];

    if (data) {
      lista = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      lista.reverse();
    }

    todosLosResultados = lista;

    // Actualizar tarjetas de métricas
    actualizarMetricasProfesor(lista);

    // Dibujar gráfico de torta SVG
    dibujarGraficoTorta(lista);

    // Dibujar barras de rendimiento por quiz
    dibujarRendimientoQuizzes(lista);

    // Renderizar tabla del profesor
    const tbody = document.getElementById("prof-table-body");
    renderizarTablaProfesor(tbody, lista);

  }, (error) => {
    console.error("Error leyendo resultados para profesor:", error);
  });

  // Filtros del profesor
  const searchInput = document.getElementById("prof-search-input");
  const filterEstado = document.getElementById("prof-filter-estado");

  const aplicarFiltrosProf = () => {
    const query = (searchInput?.value || "").toLowerCase().trim();
    const estadoVal = filterEstado?.value || "";

    const filtrados = todosLosResultados.filter(item => {
      const matchNombre = (item.nombre || "").toLowerCase().includes(query);
      const matchRut = (item.rut || "").toLowerCase().includes(query);
      const matchQuery = !query || matchNombre || matchRut;
      const matchEstado = !estadoVal || item.estado === estadoVal;

      return matchQuery && matchEstado;
    });

    const tbody = document.getElementById("prof-table-body");
    renderizarTablaProfesor(tbody, filtrados);
  };

  if (searchInput) searchInput.addEventListener("input", aplicarFiltrosProf);
  if (filterEstado) filterEstado.addEventListener("change", aplicarFiltrosProf);

  setupModalCloseHandlers();

  // --- Lógica de Pestañas (Tabs) ---
  const btnMetricas = document.getElementById("btn-tab-metricas");
  const btnEditor = document.getElementById("btn-tab-editor");
  const tabMetricas = document.getElementById("tab-metricas");
  const tabEditor = document.getElementById("tab-editor");

  if (btnMetricas && btnEditor && tabMetricas && tabEditor) {
    btnMetricas.addEventListener("click", () => {
      btnMetricas.classList.add("active");
      btnEditor.classList.remove("active");
      tabMetricas.classList.add("active");
      tabEditor.classList.remove("active");
    });

    btnEditor.addEventListener("click", () => {
      btnEditor.classList.add("active");
      btnMetricas.classList.remove("active");
      tabEditor.classList.add("active");
      tabMetricas.classList.remove("active");
      
      const quizSelect = document.getElementById("editor-quiz-select");
      if (quizSelect) {
        cargarPreguntasEditor(quizSelect.value);
      }
    });
  }

  // --- Lógica del Editor de Preguntas ---
  const quizSelect = document.getElementById("editor-quiz-select");
  if (quizSelect) {
    quizSelect.addEventListener("change", (e) => {
      cargarPreguntasEditor(e.target.value);
    });
  }

  // Cargar selector de quizzes para el editor directamente de Firebase
  cargarQuizzesParaEditor();

  const btnAgregarPregunta = document.getElementById("btn-agregar-pregunta");
  if (btnAgregarPregunta) {
    btnAgregarPregunta.addEventListener("click", () => {
      abrirModalPregunta();
    });
  }

  const btnClosePreguntaModal = document.getElementById("btn-close-pregunta-modal");
  if (btnClosePreguntaModal) {
    btnClosePreguntaModal.addEventListener("click", cerrarModalPregunta);
  }

  const btnCancelarPregunta = document.getElementById("btn-cancelar-pregunta");
  if (btnCancelarPregunta) {
    btnCancelarPregunta.addEventListener("click", cerrarModalPregunta);
  }

  const formPreguntaEditor = document.getElementById("form-pregunta-editor");
  if (formPreguntaEditor) {
    formPreguntaEditor.addEventListener("submit", guardarPreguntaFirebase);
  }
}

// Carga la lista de evaluaciones disponibles desde Firebase para el selector del editor
async function cargarQuizzesParaEditor() {
  const quizSelect = document.getElementById("editor-quiz-select");
  if (!quizSelect) return;

  try {
    const snap = await get(ref(db, "quizzes"));
    if (snap.exists()) {
      const data = snap.val();
      const currentSelected = quizSelect.value || "quiz1";
      quizSelect.innerHTML = "";

      Object.keys(data).forEach(key => {
        const item = data[key];
        const title = item.titulo || QUIZ_TITULOS[key] || key;
        const preguntasList = parsePreguntasArray(item.preguntas);
        const count = preguntasList.length;

        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${title} (${count} ${count === 1 ? 'pregunta' : 'preguntas'})`;
        quizSelect.appendChild(opt);
      });

      if (quizSelect.querySelector(`option[value="${currentSelected}"]`)) {
        quizSelect.value = currentSelected;
      }

      cargarPreguntasEditor(quizSelect.value);
    }
  } catch (err) {
    console.error("Error al cargar lista de evaluaciones para el editor:", err);
  }
}

// Carga las preguntas del Quiz seleccionado desde Firebase RTDB
async function cargarPreguntasEditor(quizKey) {
  quizEditorActivo = quizKey;
  const alertElem = document.getElementById("editor-alert");
  const alertText = document.getElementById("editor-alert-text");
  const listContainer = document.getElementById("editor-questions-list");

  if (alertElem && alertText) {
    alertText.textContent = "Cargando preguntas desde Firebase...";
    alertElem.className = "alert alert-info";
    alertElem.style.display = "flex";
  }

  if (listContainer) {
    listContainer.innerHTML = `<div class="empty-state">Conectando con Firebase...</div>`;
  }

  try {
    const snap = await get(ref(db, `quizzes/${quizKey}/preguntas`));
    const rawData = snap.val();
    
    editorPreguntasActuales = parsePreguntasArray(rawData);

    if (alertElem) alertElem.style.display = "none";

    renderizarPreguntasEditor();
  } catch (error) {
    console.error("Error al cargar preguntas para edición:", error);
    if (alertElem && alertText) {
      alertText.textContent = "Error al cargar las preguntas de Firebase.";
      alertElem.className = "alert alert-danger";
      alertElem.style.display = "flex";
    }
    if (listContainer) {
      listContainer.innerHTML = `<div class="alert alert-danger">Error de conexión a la base de datos de Firebase.</div>`;
    }
  }
}

// Renderiza las preguntas en pantalla
function renderizarPreguntasEditor() {
  const listContainer = document.getElementById("editor-questions-list");
  if (!listContainer) return;

  if (editorPreguntasActuales.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <p style="font-weight: 600; color: var(--text-main);">No hay preguntas en esta evaluación.</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">Haga clic en "Agregar Nueva Pregunta" para crear la primera.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = editorPreguntasActuales.map((q, idx) => {
    const opciones = q.opciones || [];
    const resolucion = resolverCorrecta(q);
    const correctIdx = resolucion.correctIndex;

    const optionsHtml = opciones.map((optText, optIdx) => {
      const isCorrect = optIdx === correctIdx;
      const correctClass = isCorrect ? "correct" : "";
      const checkmark = isCorrect ? "✓ " : "";
      return `
        <div class="question-editor-opt-item ${correctClass}">
          ${checkmark}${escapeHtml(optText)}
        </div>
      `;
    }).join("");

    const retroText = q.retroalimentacion || q.retroalimentación || q.explicacion || q.explicación || "";

    return `
      <div class="question-editor-card">
        <div class="question-editor-header">
          <div class="question-editor-text">
            <span style="color: var(--primary); font-weight: 800; margin-right: 0.5rem;">P${idx + 1}.</span>
            ${escapeHtml(q.pregunta || q.texto || "")}
          </div>
          <div class="question-editor-actions">
            <button class="btn btn-outline btn-icon-text btn-editar-pregunta" data-index="${idx}">
              ✏️ Editar
            </button>
            <button class="btn btn-secondary btn-icon-text btn-eliminar-pregunta" data-index="${idx}" style="background-color: var(--danger); border-color: var(--danger); color: white;">
              🗑️ Eliminar
            </button>
          </div>
        </div>
        <div class="question-editor-options">
          ${optionsHtml}
        </div>
        ${retroText ? `
          <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-muted); background: var(--bg-color); padding: 0.6rem 0.85rem; border-radius: 6px; border-left: 3px solid #ea580c;">
            <strong style="color: var(--text-main);">Retroalimentación:</strong> ${escapeHtml(retroText)}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  // Agregar eventos a botones de editar y eliminar
  const btnsEdit = listContainer.querySelectorAll(".btn-editar-pregunta");
  btnsEdit.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      abrirModalPregunta(idx);
    });
  });

  const btnsDelete = listContainer.querySelectorAll(".btn-eliminar-pregunta");
  btnsDelete.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      eliminarPregunta(idx);
    });
  });
}

// Abre el modal para agregar o editar
function abrirModalPregunta(idx = null) {
  const modal = document.getElementById("modal-pregunta");
  const form = document.getElementById("form-pregunta-editor");
  const modalTitle = document.getElementById("modal-pregunta-title");
  const editIdInput = document.getElementById("edit-pregunta-id");

  if (!modal || !form) return;

  form.reset();

  if (idx !== null && editorPreguntasActuales[idx]) {
    const q = editorPreguntasActuales[idx];
    modalTitle.textContent = `Editar Pregunta ${idx + 1}`;
    editIdInput.value = idx.toString();

    document.getElementById("pregunta-texto").value = q.pregunta || q.texto || "";
    
    const opciones = q.opciones || [];
    for (let i = 0; i < 4; i++) {
      const optInput = document.getElementById(`pregunta-opcion-${i}`);
      if (optInput) {
        optInput.value = opciones[i] || "";
      }
    }

    const resolucion = resolverCorrecta(q);
    const correctIndex = resolucion.correctIndex;
    const selectCorrecta = document.getElementById("pregunta-correcta-select");
    if (selectCorrecta) {
      selectCorrecta.value = correctIndex >= 0 ? correctIndex.toString() : "";
    }

    const explicacionInput = document.getElementById("pregunta-explicacion");
    if (explicacionInput) {
      explicacionInput.value = q.retroalimentacion || q.retroalimentación || q.explicacion || q.explicación || "";
    }
  } else {
    modalTitle.textContent = "Agregar Nueva Pregunta";
    editIdInput.value = "";

    const explicacionInput = document.getElementById("pregunta-explicacion");
    if (explicacionInput) {
      explicacionInput.value = "Es indispensable respetar el protocolo preventivo establecido por CODELCO.";
    }
  }

  modal.classList.add("active");
}

function cerrarModalPregunta() {
  const modal = document.getElementById("modal-pregunta");
  if (modal) modal.classList.remove("active");
}

// Guarda la pregunta (agrega o edita) en Firebase
async function guardarPreguntaFirebase(e) {
  e.preventDefault();

  const alertElem = document.getElementById("editor-alert");
  const alertText = document.getElementById("editor-alert-text");

  const idxVal = document.getElementById("edit-pregunta-id").value;
  const texto = document.getElementById("pregunta-texto").value.trim();
  const opt0 = document.getElementById("pregunta-opcion-0").value.trim();
  const opt1 = document.getElementById("pregunta-opcion-1").value.trim();
  const opt2 = document.getElementById("pregunta-opcion-2").value.trim();
  const opt3 = document.getElementById("pregunta-opcion-3").value.trim();
  const correctaIdx = parseInt(document.getElementById("pregunta-correcta-select").value, 10);
  const explicacionVal = (document.getElementById("pregunta-explicacion")?.value || "").trim();

  if (!texto || !opt0 || !opt1 || !opt2 || !opt3 || isNaN(correctaIdx) || !explicacionVal) {
    alert("Por favor complete todos los campos obligatorios: enunciado, 4 opciones, opción correcta y explicación.");
    return;
  }

  const opciones = [opt0, opt1, opt2, opt3];
  
  const nuevaPregunta = {
    pregunta: texto,
    opciones: opciones,
    correcta: correctaIdx,
    retroalimentacion: explicacionVal,
    explicacion: explicacionVal
  };

  const btnGuardar = document.getElementById("btn-guardar-pregunta");
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";
  }

  if (idxVal !== "") {
    const idx = parseInt(idxVal, 10);
    editorPreguntasActuales[idx] = nuevaPregunta;
  } else {
    editorPreguntasActuales.push(nuevaPregunta);
  }

  try {
    await set(ref(db, `quizzes/${quizEditorActivo}/preguntas`), editorPreguntasActuales);

    cerrarModalPregunta();
    await cargarQuizzesParaEditor();

    if (alertElem && alertText) {
      alertText.textContent = "¡Pregunta guardada exitosamente en Firebase!";
      alertElem.className = "alert alert-success";
      alertElem.style.display = "flex";
      setTimeout(() => {
        alertElem.style.display = "none";
      }, 4000);
    }
  } catch (error) {
    console.error("Error al guardar la pregunta en Firebase:", error);
    alert("Error de conexión al guardar los datos en Firebase Realtime Database.");
  } finally {
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar Pregunta";
    }
  }
}

// Elimina una pregunta de la lista en Firebase
async function eliminarPregunta(idx) {
  const q = editorPreguntasActuales[idx];
  if (!q) return;

  const confirmar = confirm(`¿Está seguro de que desea eliminar la Pregunta ${idx + 1}?\n"${q.pregunta || q.texto}"`);
  if (!confirmar) return;

  const alertElem = document.getElementById("editor-alert");
  const alertText = document.getElementById("editor-alert-text");

  editorPreguntasActuales.splice(idx, 1);

  try {
    await set(ref(db, `quizzes/${quizEditorActivo}/preguntas`), editorPreguntasActuales);
    await cargarQuizzesParaEditor();

    if (alertElem && alertText) {
      alertText.textContent = "Pregunta eliminada correctamente de Firebase.";
      alertElem.className = "alert alert-success";
      alertElem.style.display = "flex";
      setTimeout(() => {
        alertElem.style.display = "none";
      }, 4000);
    }
  } catch (error) {
    console.error("Error al eliminar la pregunta de Firebase:", error);
    alert("Error de conexión al eliminar los datos en Firebase Realtime Database.");
  }
}

// Actualizar Tarjetas de Métricas Principales
function actualizarMetricasProfesor(lista) {
  const total = lista.length;
  const aprobados = lista.filter(r => r.estado === "Aprobado").length;
  const reprobados = total - aprobados;

  const tasaAprobacion = total > 0 ? Math.round((aprobados / total) * 100) : 0;
  const tasaReprobacion = total > 0 ? Math.round((reprobados / total) * 100) : 0;

  const sumaPorcentajes = lista.reduce((acc, curr) => acc + (curr.porcentaje || 0), 0);
  const promedioGeneral = total > 0 ? Math.round(sumaPorcentajes / total) : 0;

  const elemTotal = document.getElementById("prof-total-evaluados");
  const elemTasaApro = document.getElementById("prof-tasa-aprobacion");
  const elemAprobSub = document.getElementById("prof-aprobados-sub");
  const elemPromGral = document.getElementById("prof-promedio-general");
  const elemTasaRep = document.getElementById("prof-tasa-reprobacion");
  const elemReprobSub = document.getElementById("prof-reprobados-sub");

  if (elemTotal) elemTotal.textContent = total;
  if (elemTasaApro) elemTasaApro.textContent = `${tasaAprobacion}%`;
  if (elemAprobSub) elemAprobSub.textContent = `${aprobados} de ${total} alumnos`;
  if (elemPromGral) elemPromGral.textContent = `${promedioGeneral}%`;
  if (elemTasaRep) elemTasaRep.textContent = `${tasaReprobacion}%`;
  if (elemReprobSub) elemReprobSub.textContent = `${reprobados} de ${total} alumnos`;

  // Actualizar títulos de leyenda
  const legApro = document.getElementById("legend-aprobados-title");
  const legRep = document.getElementById("legend-reprobados-title");
  if (legApro) legApro.textContent = `Aprobados: ${aprobados} (${tasaAprobacion}%)`;
  if (legRep) legRep.textContent = `Reprobados: ${reprobados} (${tasaReprobacion}%)`;
}

// Dibujar Gráfico SVG de Torta (Pie / Donut Chart) para Aprobados vs Reprobados
function dibujarGraficoTorta(lista) {
  const svgElem = document.getElementById("pie-chart-svg");
  const textCenter = document.getElementById("pie-center-percentage");

  if (!svgElem) return;

  const total = lista.length;
  if (total === 0) {
    svgElem.innerHTML = `<circle cx="100" cy="100" r="70" fill="none" stroke="#cbd5e1" stroke-width="35" />`;
    if (textCenter) textCenter.textContent = "0%";
    return;
  }

  const aprobados = lista.filter(r => r.estado === "Aprobado").length;
  const tasaAprobacion = Math.round((aprobados / total) * 100);

  if (textCenter) textCenter.textContent = `${tasaAprobacion}%`;

  // Cálculo SVG Donut Chart (radio = 70, circunferencia = 2 * PI * 70 ≈ 439.82)
  const radius = 70;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 32;
  const circumference = 2 * Math.PI * radius;

  const strokeDashAprobado = (aprobados / total) * circumference;
  const strokeDashReprobado = circumference - strokeDashAprobado;

  // SVG contenido con anillo verde y rojo
  svgElem.innerHTML = `
    <!-- Fondo Reprobados (Rojo) -->
    <circle 
      cx="${cx}" 
      cy="${cy}" 
      r="${radius}" 
      fill="none" 
      stroke="#b91c1c" 
      stroke-width="${strokeWidth}" 
    />
    <!-- Segmento Aprobados (Verde) -->
    <circle 
      cx="${cx}" 
      cy="${cy}" 
      r="${radius}" 
      fill="none" 
      stroke="#15803d" 
      stroke-width="${strokeWidth}" 
      stroke-dasharray="${strokeDashAprobado} ${strokeDashReprobado}" 
      stroke-dashoffset="${circumference / 4}" 
      style="transition: stroke-dasharray 0.6s ease;"
    />
  `;
}

// Dibujar Barras de Rendimiento por Quiz
function dibujarRendimientoQuizzes(lista) {
  const container = document.getElementById("quiz-performance-bars");
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 1.5rem;">Sin evaluaciones registradas aún.</div>`;
    return;
  }

  // Estructura para acumular estadísticas por Quiz
  const quizStats = {
    quiz1: { suma: 0, total: 0 },
    quiz2: { suma: 0, total: 0 },
    quiz3: { suma: 0, total: 0 },
    quiz4: { suma: 0, total: 0 },
    examen_final: { suma: 0, total: 0 }
  };

  lista.forEach(res => {
    const respObj = res.respuestas || {};
    QUIZ_SECUENCIA.forEach(qKey => {
      const qGroup = respObj[qKey];
      if (qGroup && qGroup.preguntas && qGroup.preguntas.length > 0) {
        let correctas = 0;
        qGroup.preguntas.forEach(p => { if (p.esCorrecta) correctas++; });
        const pct = Math.round((correctas / qGroup.preguntas.length) * 100);
        quizStats[qKey].suma += pct;
        quizStats[qKey].total += 1;
      }
    });
  });

  let html = "";
  QUIZ_SECUENCIA.forEach(qKey => {
    const stat = quizStats[qKey];
    const promPct = stat.total > 0 ? Math.round(stat.suma / stat.total) : 0;
    
    let colorClass = "medium";
    if (promPct >= 75) colorClass = "high";
    else if (promPct < 60) colorClass = "low";

    const titulo = QUIZ_TITULOS[qKey] || qKey;

    html += `
      <div class="bar-item">
        <div class="bar-header">
          <span>${escapeHtml(titulo)}</span>
          <span style="color: var(--primary);">${promPct}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="width: ${promPct}%;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Renderizar tabla del profesor
function renderizarTablaProfesor(tbody, lista) {
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <p style="font-weight: 600; color: var(--text-main);">No se encontraron registros de alumnos.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map((res) => {
    const badgeClass = res.estado === "Aprobado" ? "badge-success" : "badge-danger";

    return `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(res.nombre || "-")}</td>
        <td>${escapeHtml(res.rut || "-")}</td>
        <td>${escapeHtml(res.fecha || "-")} <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(res.hora || "")}</span></td>
        <td style="font-weight: 600;">${res.correctas !== undefined ? res.correctas : "-"} / ${(res.correctas || 0) + (res.incorrectas || 0)}</td>
        <td style="font-weight: 700; color: var(--primary);">${res.porcentaje !== undefined ? res.porcentaje : 0}%</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(res.estado || "-")}</span></td>
        <td style="text-align: center;">
          <button class="btn btn-outline btn-ver-detalle" data-id="${res.id}" style="padding: 0.35rem 0.85rem; font-size: 0.85rem;">
            🔍 Ver Detalle
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const btnsVer = tbody.querySelectorAll(".btn-ver-detalle");
  btnsVer.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      abrirModalDetalle(id);
    });
  });
}

/* ==========================================================================
   5. COMPONENTES Y MANEJO DE MODAL
   ========================================================================== */
function setupModalCloseHandlers() {
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCloseModalFooter = document.getElementById("btn-close-modal-footer");
  const modalDetail = document.getElementById("modal-detail");

  const cerrarModal = () => { if (modalDetail) modalDetail.classList.remove("active"); };
  if (btnCloseModal) btnCloseModal.onclick = cerrarModal;
  if (btnCloseModalFooter) btnCloseModalFooter.onclick = cerrarModal;
  if (modalDetail) {
    modalDetail.onclick = (e) => {
      if (e.target === modalDetail) cerrarModal();
    };
  }
}

// Abrir Modal de Detalle
function abrirModalDetalle(id) {
  const registro = todosLosResultados.find(r => r.id === id);
  if (!registro) return;

  const modalDetail = document.getElementById("modal-detail");
  const modalBody = document.getElementById("modal-detail-body");
  if (!modalDetail || !modalBody) return;

  const badgeClass = registro.estado === "Aprobado" ? "badge-success" : "badge-danger";

  let html = `
    <div class="participant-summary-grid">
      <div>
        <div class="summary-label">Nombre Alumno</div>
        <div class="summary-value">${escapeHtml(registro.nombre || "-")}</div>
      </div>
      <div>
        <div class="summary-label">RUT</div>
        <div class="summary-value">${escapeHtml(registro.rut || "-")}</div>
      </div>
      <div>
        <div class="summary-label">Fecha / Hora</div>
        <div class="summary-value">${escapeHtml(registro.fecha || "")} ${escapeHtml(registro.hora || "")}</div>
      </div>
      <div>
        <div class="summary-label">Puntaje Obtenido</div>
        <div class="summary-value" style="color: var(--primary);">${registro.porcentaje}%</div>
      </div>
      <div>
        <div class="summary-label">Estado Final</div>
        <div class="summary-value">
          <span class="badge ${badgeClass}">${escapeHtml(registro.estado)}</span>
        </div>
      </div>
      <div>
        <div class="summary-label">Respuestas Correctas</div>
        <div class="summary-value">${registro.correctas !== undefined ? registro.correctas : 0} correctas</div>
      </div>
    </div>

    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--primary);">
      Inspección por Quizzes y Preguntas:
    </h3>
  `;

  const respuestasObj = registro.respuestas || {};
  const keys = Object.keys(respuestasObj);

  if (keys.length === 0) {
    html += `<div class="alert alert-info">No se encontraron detalles de respuestas para este registro.</div>`;
  } else {
    keys.forEach((key, idx) => {
      const qGroup = respuestasObj[key];
      const tituloGroup = qGroup.titulo || QUIZ_TITULOS[key] || `Quiz ${idx + 1}`;
      const preguntas = qGroup.preguntas || [];

      let correctasContador = 0;
      preguntas.forEach(p => { if (p.esCorrecta) correctasContador++; });

      html += `
        <div class="quiz-review-card">
          <div class="quiz-review-header">
            <span>${escapeHtml(tituloGroup)}</span>
            <span class="badge badge-info">${correctasContador} de ${preguntas.length} Correctas</span>
          </div>
          <div>
      `;

      preguntas.forEach((p, pIdx) => {
        const icon = p.esCorrecta ? "✅ Correcta" : "❌ Incorrecta";
        const boxClass = p.esCorrecta ? "correct" : "incorrect";
        const retro = p.retroalimentacion || p.retroalimentación || p.explicacion || p.explicación || "";

        html += `
          <div class="question-review-row">
            <div class="review-q-text">
              ${pIdx + 1}. ${escapeHtml(p.pregunta)}
            </div>
            <div class="review-grid">
              <div class="review-box ${boxClass}">
                <strong>Respuesta del alumno:</strong><br>
                ${escapeHtml(p.respuestaTrabajador)} (${icon})
              </div>
              <div class="review-box expected">
                <strong>Respuesta correcta esperada:</strong><br>
                ✓ ${escapeHtml(p.respuestaCorrecta)}
              </div>
            </div>
            ${retro ? `
              <div style="margin-top: 0.6rem; font-size: 0.85rem; color: var(--text-muted); background: var(--bg-color); padding: 0.55rem 0.85rem; border-radius: 6px; border-left: 3px solid #ea580c;">
                <strong style="color: var(--text-main);">Retroalimentación:</strong> ${escapeHtml(retro)}
              </div>
            ` : ""}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });
  }

  modalBody.innerHTML = html;
  modalDetail.classList.add("active");
}

/* ==========================================================================
   UTILIDADES
   ========================================================================== */

function parsePreguntasArray(preguntasData) {
  if (!preguntasData) return [];
  if (Array.isArray(preguntasData)) {
    return preguntasData.filter(Boolean);
  }
  if (typeof preguntasData === "object") {
    return Object.keys(preguntasData).map(key => ({
      id: key,
      ...preguntasData[key]
    }));
  }
  return [];
}

function resolverCorrecta(q) {
  let correctIndex = -1;
  let correctText = "";

  const opciones = q.opciones || [];

  if (typeof q.correcta === "number") {
    correctIndex = q.correcta;
  } else if (!isNaN(parseInt(q.correcta, 10)) && parseInt(q.correcta, 10) < opciones.length) {
    correctIndex = parseInt(q.correcta, 10);
  }

  if (correctIndex >= 0 && opciones[correctIndex] !== undefined) {
    correctText = opciones[correctIndex];
  } else if (typeof q.correcta === "string") {
    correctText = q.correcta;
    correctIndex = opciones.indexOf(q.correcta);
  }

  return { correctIndex, correctText };
}

function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
