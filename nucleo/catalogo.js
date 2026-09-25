/* ============================================================
   FABRICA · catalogo.js — catalogo generico dirigido por datos
   ------------------------------------------------------------
   Extraido de lo que funciono en un catalogo real, SIN nada de
   ese cliente: ni marca, ni colores, ni reglas propias.

   Datos: datos/productos.json (lo genera importar_catalogo.py)
     {
       "moneda": "USD",
       "escalas": [{"desde":1,"etiqueta":"Unidad"},{"desde":6,"etiqueta":"Media docena"}],
       "categorias": [{"id":"acc","nombre":"Accesorios"}],
       "productos": [{ "id","nombre","categoria","descripcion","imagen",
                       "precio": 1200, "precios": {"6": 1000}, "sku","activo" }]
     }

   Las escalas las define el proyecto. El modulo NO conoce x3, x10
   ni ninguna cantidad: lee las que vengan.

   HTML minimo:
     <div data-fx-catalogo
          data-datos="datos/productos.json"
          data-tel="549223..."></div>

   URL individual: ?p=<id> abre la ficha y es compartible.
   ============================================================ */
(function () {
  "use strict";

  var CLAVE_CONSULTA = "fx-consulta";

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function crear(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto != null) el.textContent = texto;
    return el;
  }
  function normalizar(t) {
    return (t || "").toString().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function plata(n, moneda) {
    if (n == null || isNaN(n)) return "";
    return (moneda ? moneda + " " : "") + Number(n).toLocaleString("es-AR");
  }

  /* --- Precios por escala ----------------------------------- */
  /* Devuelve [{desde, etiqueta, precio}] ordenado, solo con los
     tramos que el producto realmente define. Si no hay escalas,
     devuelve un unico tramo con el precio unitario. */
  function tramos(prod, escalas) {
    var mapa = prod.precios || {};
    var lista = [];
    (escalas || []).forEach(function (e) {
      var p = mapa[String(e.desde)];
      if (p == null && e.desde === 1) p = prod.precio;
      if (p != null) lista.push({ desde: e.desde, etiqueta: e.etiqueta, precio: Number(p) });
    });
    if (!lista.length && prod.precio != null) {
      lista.push({ desde: 1, etiqueta: "Precio", precio: Number(prod.precio) });
    }
    return lista.sort(function (a, b) { return a.desde - b.desde; });
  }

  function precioDesde(prod, escalas) {
    var t = tramos(prod, escalas);
    if (!t.length) return null;
    return t.reduce(function (min, x) { return x.precio < min ? x.precio : min; }, t[0].precio);
  }

  /* --- Consulta (carrito) ----------------------------------- */
  function leerConsulta() {
    try { return JSON.parse(localStorage.getItem(CLAVE_CONSULTA) || "[]"); }
    catch (e) { return []; }
  }
  function guardarConsulta(items) {
    try { localStorage.setItem(CLAVE_CONSULTA, JSON.stringify(items)); } catch (e) { /* incognito */ }
  }

  /* --- Catalogo --------------------------------------------- */
  function Catalogo(raiz) {
    this.raiz = raiz;
    this.tel = (raiz.getAttribute("data-tel") || "").replace(/[^0-9]/g, "");
    this.url = raiz.getAttribute("data-datos") || "datos/productos.json";
    this.datos = null;
    this.filtro = { texto: "", categoria: "" };
    this.consulta = leerConsulta();
  }

  Catalogo.prototype.iniciar = function () {
    var self = this;
    this.esqueleto();
    this.estado("Cargando productos...");
    fetch(this.url, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se pudo leer " + self.url + " (" + r.status + ")");
        return r.json();
      })
      .then(function (d) {
        self.datos = d;
        self.datos.productos = (d.productos || []).filter(function (p) { return p.activo !== false; });
        if (!self.datos.productos.length) {
          self.estado("Todavia no hay productos cargados.");
          return;
        }
        self.pintarFiltros();
        self.pintar();
        self.pintarConsulta();
        self.desdeURL();
      })
      .catch(function (e) {
        self.estado("No pudimos cargar el catalogo. Refresca la pagina o escribinos.");
        if (window.console) console.error("[fx-catalogo]", e.message);
      });
  };

  Catalogo.prototype.esqueleto = function () {
    this.raiz.innerHTML = "";
    this.barra = crear("div", "fx-cat-barra");
    this.buscador = crear("input", "fx-cat-buscar");
    this.buscador.type = "search";
    this.buscador.placeholder = "Buscar producto...";
    this.buscador.setAttribute("aria-label", "Buscar producto");
    this.categorias = crear("div", "fx-cat-categorias");
    this.categorias.setAttribute("role", "group");
    this.categorias.setAttribute("aria-label", "Categorias");
    this.contador = crear("p", "fx-cat-contador");
    this.contador.setAttribute("aria-live", "polite");
    this.grilla = crear("div", "fx-cat-grilla");
    this.cajaEstado = crear("p", "fx-cat-estado");
    this.panelConsulta = crear("aside", "fx-cat-consulta");
    this.panelConsulta.setAttribute("aria-label", "Pedido de consulta");

    this.barra.appendChild(this.buscador);
    this.barra.appendChild(this.categorias);
    this.raiz.appendChild(this.barra);
    this.raiz.appendChild(this.contador);
    this.raiz.appendChild(this.cajaEstado);
    this.raiz.appendChild(this.grilla);
    this.raiz.appendChild(this.panelConsulta);

    var self = this;
    var reloj;
    this.buscador.addEventListener("input", function () {
      clearTimeout(reloj);
      reloj = setTimeout(function () {
        self.filtro.texto = normalizar(self.buscador.value);
        self.pintar();
      }, 150);
    });
    addEventListener("popstate", function () { self.desdeURL(); });
  };

  Catalogo.prototype.estado = function (msg) {
    this.cajaEstado.textContent = msg || "";
    this.cajaEstado.style.display = msg ? "" : "none";
  };

  Catalogo.prototype.pintarFiltros = function () {
    var self = this;
    var cats = this.datos.categorias || [];
    this.categorias.innerHTML = "";
    var todas = [{ id: "", nombre: "Todo" }].concat(cats);
    todas.forEach(function (c) {
      var b = crear("button", "fx-cat-chip", c.nombre);
      b.type = "button";
      b.setAttribute("data-cat", c.id);
      b.setAttribute("aria-pressed", c.id === self.filtro.categoria ? "true" : "false");
      b.addEventListener("click", function () {
        self.filtro.categoria = c.id;
        self.categorias.querySelectorAll("button").forEach(function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-cat") === c.id ? "true" : "false");
        });
        self.pintar();
      });
      self.categorias.appendChild(b);
    });
  };

  Catalogo.prototype.filtrados = function () {
    var f = this.filtro;
    return this.datos.productos.filter(function (p) {
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (!f.texto) return true;
      return normalizar(p.nombre + " " + (p.descripcion || "") + " " + (p.sku || "")).indexOf(f.texto) !== -1;
    });
  };

  Catalogo.prototype.pintar = function () {
    var self = this;
    var lista = this.filtrados();
    var moneda = this.datos.moneda || "";
    this.grilla.innerHTML = "";
    this.contador.textContent = lista.length + (lista.length === 1 ? " producto" : " productos");

    if (!lista.length) {
      this.estado("No encontramos nada con esa busqueda. Probá con otra palabra.");
      return;
    }
    this.estado("");

    var frag = document.createDocumentFragment();
    lista.forEach(function (p, i) {
      var card = crear("article", "fx-cat-card");
      card.setAttribute("data-id", p.id);

      if (p.imagen) {
        var med = crear("div", "fx-cat-media");
        var img = crear("img");
        img.src = p.imagen;
        img.alt = p.nombre;
        img.loading = i < 6 ? "eager" : "lazy";   // las primeras entran ya; el resto, al hacer scroll
        img.decoding = "async";
        med.appendChild(img);
        card.appendChild(med);
      }

      var h = crear("h3", "fx-cat-nombre", p.nombre);
      card.appendChild(h);
      if (p.sku) card.appendChild(crear("p", "fx-cat-sku", p.sku));

      var t = tramos(p, self.datos.escalas);
      if (t.length) {
        var pr = crear("p", "fx-cat-precio", plata(t[0].precio, moneda));
        if (t.length > 1) {
          var chico = crear("span", "fx-cat-desde", " · desde " + plata(precioDesde(p, self.datos.escalas), moneda));
          pr.appendChild(chico);
        }
        card.appendChild(pr);
      }

      var acciones = crear("div", "fx-cat-acciones");
      var ver = crear("button", "fx-btn fx-btn--fantasma", "Ver");
      ver.type = "button";
      ver.addEventListener("click", function () { self.abrirFicha(p.id, true); });
      var sumar = crear("button", "fx-btn", "Sumar a la consulta");
      sumar.type = "button";
      sumar.addEventListener("click", function () { self.sumar(p.id); });
      acciones.appendChild(ver);
      acciones.appendChild(sumar);
      card.appendChild(acciones);

      frag.appendChild(card);
    });
    this.grilla.appendChild(frag);
  };

  /* --- Ficha de producto (URL propia compartible) ------------ */
  Catalogo.prototype.abrirFicha = function (id, empujarURL) {
    var self = this;
    var p = this.datos.productos.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    var moneda = this.datos.moneda || "";

    var fondo = crear("div", "fx-cat-modal");
    fondo.setAttribute("role", "dialog");
    fondo.setAttribute("aria-modal", "true");
    fondo.setAttribute("aria-label", p.nombre);

    var caja = crear("div", "fx-cat-modal-caja");
    var cerrar = crear("button", "fx-cat-cerrar", "×");
    cerrar.type = "button";
    cerrar.setAttribute("aria-label", "Cerrar");
    caja.appendChild(cerrar);

    if (p.imagen) {
      var img = crear("img");
      img.src = p.imagen; img.alt = p.nombre; img.className = "fx-cat-modal-img";
      caja.appendChild(img);
    }
    caja.appendChild(crear("h2", null, p.nombre));
    if (p.sku) caja.appendChild(crear("p", "fx-cat-sku", p.sku));
    if (p.descripcion) caja.appendChild(crear("p", null, p.descripcion));

    var t = tramos(p, this.datos.escalas);
    if (t.length) {
      var tabla = crear("table", "fx-cat-escalas");
      var cuerpo = crear("tbody");
      t.forEach(function (x) {
        var tr = crear("tr");
        tr.appendChild(crear("th", null, x.etiqueta + (x.desde > 1 ? " (desde " + x.desde + ")" : "")));
        tr.appendChild(crear("td", null, plata(x.precio, moneda)));
        cuerpo.appendChild(tr);
      });
      tabla.appendChild(cuerpo);
      var env = crear("div", "fx-tabla-scroll");
      env.appendChild(tabla);
      caja.appendChild(env);
    }

    var sumar = crear("button", "fx-btn", "Sumar a la consulta");
    sumar.type = "button";
    sumar.addEventListener("click", function () { self.sumar(p.id); });
    caja.appendChild(sumar);

    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    cerrar.focus();

    function salir() {
      fondo.remove();
      document.removeEventListener("keydown", esc);
      var u = new URL(location.href);
      u.searchParams.delete("p");
      history.replaceState({}, "", u.pathname + (u.search || "") + u.hash);
    }
    function esc(e) { if (e.key === "Escape") salir(); }
    cerrar.addEventListener("click", salir);
    fondo.addEventListener("click", function (e) { if (e.target === fondo) salir(); });
    document.addEventListener("keydown", esc);

    if (empujarURL) {
      var u2 = new URL(location.href);
      u2.searchParams.set("p", p.id);
      history.pushState({ p: p.id }, "", u2);
    }
    if (window.FXAnalitica) window.FXAnalitica.evento("producto_visto", { id: p.id, nombre: p.nombre });
  };

  Catalogo.prototype.desdeURL = function () {
    var id = new URL(location.href).searchParams.get("p");
    var abierto = $(".fx-cat-modal");
    if (abierto) abierto.remove();
    if (id) this.abrirFicha(id, false);
  };

  /* --- Consulta --------------------------------------------- */
  Catalogo.prototype.sumar = function (id) {
    var item = this.consulta.filter(function (x) { return String(x.id) === String(id); })[0];
    if (item) item.cantidad += 1;
    else this.consulta.push({ id: id, cantidad: 1 });
    guardarConsulta(this.consulta);
    this.pintarConsulta();
    var p = this.datos.productos.filter(function (x) { return String(x.id) === String(id); })[0];
    if (window.FXAnalitica) window.FXAnalitica.evento("agregar_consulta", { id: id, nombre: p ? p.nombre : "" });
  };

  Catalogo.prototype.quitar = function (id) {
    this.consulta = this.consulta.filter(function (x) { return String(x.id) !== String(id); });
    guardarConsulta(this.consulta);
    this.pintarConsulta();
  };

  Catalogo.prototype.pintarConsulta = function () {
    var self = this;
    var panel = this.panelConsulta;
    panel.innerHTML = "";
    if (!this.consulta.length) { panel.style.display = "none"; return; }
    panel.style.display = "";

    panel.appendChild(crear("h3", null, "Tu consulta (" + this.consulta.length + ")"));
    var ul = crear("ul", "fx-cat-consulta-lista");
    this.consulta.forEach(function (item) {
      var p = self.datos.productos.filter(function (x) { return String(x.id) === String(item.id); })[0];
      if (!p) return;
      var li = crear("li");
      li.appendChild(crear("span", null, p.nombre + " x" + item.cantidad));
      var x = crear("button", "fx-cat-quitar", "Quitar");
      x.type = "button";
      x.setAttribute("aria-label", "Quitar " + p.nombre);
      x.addEventListener("click", function () { self.quitar(item.id); });
      li.appendChild(x);
      ul.appendChild(li);
    });
    panel.appendChild(ul);

    if (this.tel) {
      var a = crear("a", "fx-btn", "Pedir por WhatsApp");
      a.href = "https://wa.me/" + this.tel + "?text=" + encodeURIComponent(this.mensaje());
      a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("data-fx-wa-listo", "1");
      panel.appendChild(a);
    }
    var vaciar = crear("button", "fx-cat-quitar", "Vaciar");
    vaciar.type = "button";
    vaciar.addEventListener("click", function () {
      self.consulta = []; guardarConsulta([]); self.pintarConsulta();
    });
    panel.appendChild(vaciar);
  };

  Catalogo.prototype.mensaje = function () {
    var self = this;
    var lineas = ["Hola! Quiero consultar por:"];
    this.consulta.forEach(function (item) {
      var p = self.datos.productos.filter(function (x) { return String(x.id) === String(item.id); })[0];
      if (p) lineas.push("- " + p.nombre + (p.sku ? " (" + p.sku + ")" : "") + " x" + item.cantidad);
    });
    return lineas.join("\n");
  };

  function iniciar() {
    document.querySelectorAll("[data-fx-catalogo]").forEach(function (raiz) {
      if (raiz.getAttribute("data-fx-listo") === "1") return;
      raiz.setAttribute("data-fx-listo", "1");
      new Catalogo(raiz).iniciar();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.FXCatalogo = { iniciar: iniciar, tramos: tramos };
})();
