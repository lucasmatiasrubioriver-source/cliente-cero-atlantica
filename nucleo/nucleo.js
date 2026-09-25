/* ============================================================
   FABRICA · nucleo.js — comportamiento comun de todo sitio
   ------------------------------------------------------------
   Vanilla, sin dependencias, seguro de ejecutar dos veces.
   Cada pieza se activa SOLO si el HTML la tiene: un sitio sin
   menu movil no paga nada por incluir este archivo.

   Contrato de clases (no cambiar sin actualizar el auditor):
     .fx-nav-boton  + .fx-nav       menu movil
     [data-fx-wa]                    links de WhatsApp
     [data-fx-anio]                  anio actual en el footer
   ============================================================ */
(function () {
  "use strict";

  var listo = false;

  function iniciar() {
    if (listo) return;          // idempotente: correrlo dos veces no duplica nada
    listo = true;
    menuMovil();
    whatsapp();
    anio();
    anclas();
    paginaActual();
  }

  /* --- Menu movil accesible --------------------------------- */
  function menuMovil() {
    var boton = document.querySelector(".fx-nav-boton");
    var nav = document.querySelector(".fx-nav");
    if (!boton || !nav) return;

    if (!nav.id) nav.id = "fx-nav";
    boton.setAttribute("aria-controls", nav.id);
    boton.setAttribute("aria-expanded", "false");

    function abrir(si) {
      nav.setAttribute("data-abierto", si ? "true" : "false");
      boton.setAttribute("aria-expanded", si ? "true" : "false");
      if (si) {
        var primero = nav.querySelector("a, button");
        if (primero) primero.focus();
      }
    }

    boton.addEventListener("click", function () {
      abrir(boton.getAttribute("aria-expanded") !== "true");
    });

    // Escape cierra y devuelve el foco al boton
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && boton.getAttribute("aria-expanded") === "true") {
        abrir(false);
        boton.focus();
      }
    });

    // Elegir un destino cierra el menu
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) abrir(false);
    });

    // Si la pantalla crece, el menu vuelve a ser barra: hay que limpiarlo
    addEventListener("resize", function () {
      if (innerWidth > 860) abrir(false);
    }, { passive: true });
  }

  /* --- WhatsApp: arma el link con el mensaje precargado ------ */
  /* <a data-fx-wa data-tel="5492235457268" data-msg="Hola, quiero...">  */
  function whatsapp() {
    document.querySelectorAll("[data-fx-wa]").forEach(function (a) {
      var tel = (a.getAttribute("data-tel") || "").replace(/[^0-9]/g, "");
      if (!tel) return;                       // sin numero no se inventa un link roto
      var msg = a.getAttribute("data-msg") || "";
      a.setAttribute("href", "https://wa.me/" + tel + (msg ? "?text=" + encodeURIComponent(msg) : ""));
      a.setAttribute("rel", "noopener");
      if (!a.getAttribute("target")) a.setAttribute("target", "_blank");
    });
  }

  /* --- Anio actual (para que el footer no envejezca) -------- */
  function anio() {
    var y = String(new Date().getFullYear());
    document.querySelectorAll("[data-fx-anio]").forEach(function (el) { el.textContent = y; });
  }

  /* --- Anclas: compensa el header sticky -------------------- */
  function anclas() {
    var header = document.querySelector(".fx-header");
    if (!header) return;
    document.documentElement.style.scrollPaddingTop = (header.offsetHeight + 8) + "px";
  }

  /* --- Marca el link de la pagina actual --------------------- */
  function paginaActual() {
    var aqui = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".fx-nav a").forEach(function (a) {
      var destino = (a.getAttribute("href") || "").split("/").pop().split("#")[0];
      if (destino && destino === aqui) a.setAttribute("aria-current", "page");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.FX = window.FX || {};
  window.FX.iniciar = iniciar;   // por si el proyecto inyecta HTML despues
})();
