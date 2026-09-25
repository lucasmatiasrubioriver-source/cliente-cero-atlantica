/* ============================================================
   FABRICA · formulario.js — formularios que REALMENTE envian
   ------------------------------------------------------------
   Configuracion por proyecto, cero credenciales en el codigo.

   <form class="fx-form" data-fx-form
         data-destino="endpoint|whatsapp|mailto"
         data-endpoint="https://..."        (solo endpoint)
         data-tel="549223..."               (solo whatsapp)
         data-email="hola@cliente.com">     (solo mailto)

   Campos: cualquier input/textarea/select con name.
     - required           -> obligatorio
     - type=email / tel   -> validacion de formato
     - .fx-trampa input   -> honeypot (si viene lleno, es un bot)

   Estados: aria-live avisa a lectores de pantalla.
   Anti-abuso: honeypot + tiempo minimo + limite por minuto.
   ============================================================ */
(function () {
  "use strict";

  var MIN_SEGUNDOS = 3;        // un humano no completa un form en menos
  var MAX_POR_HORA = 5;
  var CLAVE_LIMITE = "fx-form-envios";

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  var RE_TEL = /^[0-9+()\s-]{6,20}$/;

  function texto(campo, clave, porDefecto) {
    return campo.getAttribute("data-msg-" + clave) || porDefecto;
  }

  function marcarError(campo, mensaje) {
    var cont = campo.closest(".fx-campo") || campo.parentElement;
    cont.setAttribute("data-error", "true");
    campo.setAttribute("aria-invalid", "true");
    var caja = cont.querySelector(".fx-error");
    if (!caja) {
      caja = document.createElement("div");
      caja.className = "fx-error";
      cont.appendChild(caja);
    }
    if (!caja.id) caja.id = "err-" + (campo.name || Math.random().toString(36).slice(2));
    campo.setAttribute("aria-describedby", caja.id);
    caja.textContent = mensaje;
  }

  function limpiarError(campo) {
    var cont = campo.closest(".fx-campo") || campo.parentElement;
    cont.removeAttribute("data-error");
    campo.removeAttribute("aria-invalid");
    var caja = cont.querySelector(".fx-error");
    if (caja) caja.textContent = "";
  }

  function validar(form) {
    var ok = true, primero = null;
    form.querySelectorAll("input, textarea, select").forEach(function (campo) {
      if (campo.closest(".fx-trampa") || campo.type === "submit" || campo.type === "hidden") return;
      limpiarError(campo);
      var v = (campo.value || "").trim();
      if (campo.required && !v) {
        marcarError(campo, texto(campo, "requerido", "Este dato hace falta."));
        ok = false; primero = primero || campo; return;
      }
      if (!v) return;
      if (campo.type === "email" && !RE_EMAIL.test(v)) {
        marcarError(campo, texto(campo, "email", "Revisa el email: parece incompleto."));
        ok = false; primero = primero || campo;
      }
      if (campo.type === "tel" && !RE_TEL.test(v)) {
        marcarError(campo, texto(campo, "tel", "Revisa el telefono: solo numeros y separadores."));
        ok = false; primero = primero || campo;
      }
      if (campo.minLength > 0 && v.length < campo.minLength) {
        marcarError(campo, texto(campo, "corto", "Contanos un poco mas (minimo " + campo.minLength + " caracteres)."));
        ok = false; primero = primero || campo;
      }
    });
    if (primero) primero.focus();
    return ok;
  }

  function datos(form) {
    var d = {};
    new FormData(form).forEach(function (valor, clave) {
      if (form.querySelector('[name="' + clave + '"]') &&
          form.querySelector('[name="' + clave + '"]').closest(".fx-trampa")) return;
      d[clave] = valor;
    });
    return d;
  }

  function limiteSuperado() {
    try {
      var ahora = Date.now();
      var previos = JSON.parse(localStorage.getItem(CLAVE_LIMITE) || "[]")
                        .filter(function (t) { return ahora - t < 3600000; });
      if (previos.length >= MAX_POR_HORA) return true;
      previos.push(ahora);
      localStorage.setItem(CLAVE_LIMITE, JSON.stringify(previos));
      return false;
    } catch (e) {
      return false;             // sin localStorage (incognito) no se bloquea a nadie
    }
  }

  function estado(form, tipo, mensaje) {
    var caja = form.querySelector(".fx-form-estado");
    if (!caja) {
      caja = document.createElement("div");
      caja.className = "fx-form-estado";
      form.appendChild(caja);
    }
    caja.setAttribute("role", "status");
    caja.setAttribute("aria-live", "polite");
    caja.setAttribute("data-tipo", tipo);
    caja.textContent = mensaje;
  }

  function enviar(form) {
    var destino = form.getAttribute("data-destino") || "endpoint";
    var d = datos(form);

    if (destino === "whatsapp") {
      var tel = (form.getAttribute("data-tel") || "").replace(/[^0-9]/g, "");
      if (!tel) return Promise.reject(new Error("Falta data-tel en el formulario"));
      var lineas = Object.keys(d).map(function (k) { return k + ": " + d[k]; }).join("\n");
      open("https://wa.me/" + tel + "?text=" + encodeURIComponent(lineas), "_blank", "noopener");
      return Promise.resolve();
    }

    if (destino === "mailto") {
      var mail = form.getAttribute("data-email");
      if (!mail) return Promise.reject(new Error("Falta data-email en el formulario"));
      var cuerpo = Object.keys(d).map(function (k) { return k + ": " + d[k]; }).join("\n");
      location.href = "mailto:" + mail + "?subject=" +
        encodeURIComponent(form.getAttribute("data-asunto") || "Consulta desde la web") +
        "&body=" + encodeURIComponent(cuerpo);
      return Promise.resolve();
    }

    var url = form.getAttribute("data-endpoint");
    if (!url) return Promise.reject(new Error("Falta data-endpoint en el formulario"));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(d)
    }).then(function (r) {
      if (!r.ok) throw new Error("El servidor respondio " + r.status);
      return r;
    });
  }

  function conectar(form) {
    if (form.getAttribute("data-fx-listo") === "1") return;
    form.setAttribute("data-fx-listo", "1");
    form.setAttribute("novalidate", "novalidate");   // validamos nosotros, con mensajes en castellano
    var nacido = Date.now();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var boton = form.querySelector('[type="submit"]');
      var trampa = form.querySelector(".fx-trampa input");

      if (trampa && trampa.value) {                  // bot: se le dice que si y no se manda nada
        estado(form, "ok", form.getAttribute("data-msg-ok") || "Listo, recibimos tu mensaje.");
        return;
      }
      if (Date.now() - nacido < MIN_SEGUNDOS * 1000) {
        estado(form, "error", "Tomate un segundo mas y volve a enviar.");
        return;
      }
      if (!validar(form)) {
        estado(form, "error", "Revisa los campos marcados.");
        return;
      }
      if (limiteSuperado()) {
        estado(form, "error", "Ya enviaste varios mensajes. Escribinos por WhatsApp si es urgente.");
        return;
      }

      if (boton) { boton.disabled = true; boton.setAttribute("data-texto", boton.textContent); boton.textContent = "Enviando..."; }
      estado(form, "enviando", "Enviando...");

      enviar(form).then(function () {
        form.reset();
        estado(form, "ok", form.getAttribute("data-msg-ok") || "Listo, recibimos tu mensaje. Te respondemos a la brevedad.");
        if (window.FXAnalitica) window.FXAnalitica.evento("formulario_enviado", { formulario: form.getAttribute("name") || "contacto" });
      }).catch(function (err) {
        estado(form, "error", (form.getAttribute("data-msg-error") ||
          "No pudimos enviarlo. Probá de nuevo o escribinos por WhatsApp.") );
        if (window.console) console.error("[fx-form]", err.message);
      }).then(function () {
        if (boton) { boton.disabled = false; boton.textContent = boton.getAttribute("data-texto") || "Enviar"; }
      });
    });
  }

  function iniciar() {
    document.querySelectorAll("form[data-fx-form]").forEach(conectar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.FXFormulario = { iniciar: iniciar, validar: validar };
})();
