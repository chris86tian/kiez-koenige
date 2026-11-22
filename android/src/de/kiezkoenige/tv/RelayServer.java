package de.kiezkoenige.tv;

import android.content.res.AssetManager;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mini-Webserver im Heimnetz – derselbe Ablauf wie tools/devserver.mjs:
 *   /game/*        Spiel (lädt die WebView auf dem Fernseher)
 *   /c/*, /        Handy-Controller
 *   /api/info      IP + Port für die QR-Codes
 *   /api/in        POST: Handy schickt Befehl · GET: Fernseher holt alle neuen Befehle ab
 *   /api/state     POST: Fernseher veröffentlicht Zustand · GET ?p=N: Handy liest seinen Zustand
 */
public class RelayServer {
    private final AssetManager assets;
    private ServerSocket server;
    private ExecutorService pool;
    private volatile boolean running;
    public int port;

    private final List<String> queue = new ArrayList<String>();
    private final Map<String, Long> seen = new HashMap<String, Long>();
    private final Map<String, String> state = new HashMap<String, String>();

    public RelayServer(AssetManager assets) { this.assets = assets; }

    /** Startet auf dem ersten freien Port ab 8090. */
    public int start() throws IOException {
        IOException last = null;
        for (int p = 8090; p < 8100; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s; port = p; break;
            } catch (IOException e) { last = e; }
        }
        if (server == null) throw last;
        running = true;
        pool = Executors.newCachedThreadPool();
        Thread t = new Thread(new Runnable() {
            public void run() {
                while (running) {
                    try {
                        final Socket c = server.accept();
                        pool.execute(new Runnable() { public void run() { handle(c); } });
                    } catch (IOException e) { /* beim Beenden normal */ }
                }
            }
        }, "kk-relay");
        t.setDaemon(true);
        t.start();
        return port;
    }

    public void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        if (pool != null) pool.shutdownNow();
    }

    /** IPv4-Adresse im WLAN/LAN (für die QR-Codes). */
    public static String lanIp() {
        String fallback = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    String n = ni.getName();
                    if (n.startsWith("wlan") || n.startsWith("eth")) return ip;
                    if (fallback == null) fallback = ip;
                }
            }
        } catch (Exception ignored) { }
        return fallback != null ? fallback : "127.0.0.1";
    }

    /* ---------------- HTTP ---------------- */

    private void handle(Socket c) {
        try {
            c.setSoTimeout(8000);
            c.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(c.getInputStream());
            OutputStream out = c.getOutputStream();
            String line = readLine(in);
            if (line == null || line.isEmpty()) { c.close(); return; }
            String[] parts = line.split(" ");
            if (parts.length < 2) { c.close(); return; }
            String method = parts[0], target = parts[1];
            int len = 0;
            String h;
            while ((h = readLine(in)) != null && !h.isEmpty()) {
                int i = h.indexOf(':');
                if (i > 0 && h.substring(0, i).trim().equalsIgnoreCase("content-length")) {
                    try { len = Integer.parseInt(h.substring(i + 1).trim()); } catch (NumberFormatException ignored) { }
                }
            }
            String body = "";
            if (len > 0 && len < 200000) {
                byte[] b = new byte[len];
                int r = 0;
                while (r < len) { int n = in.read(b, r, len - r); if (n < 0) break; r += n; }
                body = new String(b, 0, r, "UTF-8");
            }
            String path = target, query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
            route(method, path, query, body, out);
            out.flush();
        } catch (Exception ignored) {
        } finally {
            try { c.close(); } catch (IOException ignored) { }
        }
    }

    private void route(String method, String path, String query, String body, OutputStream out) throws IOException {
        long now = System.currentTimeMillis();
        if (path.equals("/api/info")) {
            json(out, "{\"ip\":\"" + lanIp() + "\",\"port\":" + port + "}");
            return;
        }
        if (path.equals("/api/in")) {
            if (method.equals("POST")) {
                try {
                    JSONObject e = new JSONObject(body);
                    e.put("t", now);
                    String p = e.optString("p", "");
                    synchronized (this) {
                        if (!p.isEmpty()) seen.put(p, now);
                        queue.add(e.toString());
                        if (queue.size() > 300) queue.remove(0);
                    }
                } catch (Exception ignored) { }
                json(out, "{\"ok\":true}");
            } else {
                StringBuilder sb = new StringBuilder("{\"events\":[");
                synchronized (this) {
                    for (int i = 0; i < queue.size(); i++) { if (i > 0) sb.append(','); sb.append(queue.get(i)); }
                    queue.clear();
                    sb.append("],\"seen\":{");
                    boolean first = true;
                    for (Map.Entry<String, Long> en : seen.entrySet()) {
                        if (!first) sb.append(',');
                        first = false;
                        sb.append(JSONObject.quote(en.getKey())).append(':').append(now - en.getValue());
                    }
                }
                sb.append("}}");
                json(out, sb.toString());
            }
            return;
        }
        if (path.equals("/api/state")) {
            if (method.equals("POST")) {
                try {
                    JSONObject j = new JSONObject(body);
                    Iterator<String> it = j.keys();
                    synchronized (this) {
                        while (it.hasNext()) { String k = it.next(); state.put(k, j.get(k).toString()); }
                    }
                } catch (Exception ignored) { }
                json(out, "{\"ok\":true}");
            } else {
                String p = param(query, "p");
                String s;
                synchronized (this) {
                    if (p != null) seen.put(p, now);
                    s = p != null ? state.get(p) : null;
                }
                json(out, s != null ? s : "{}");
            }
            return;
        }
        // statische Dateien aus den Assets
        String file = path.equals("/") ? "/c/index.html" : path;
        if (file.endsWith("/")) file += "index.html";
        String base;
        if (file.startsWith("/game/")) { base = "game/"; file = file.substring(6); }
        else if (file.startsWith("/c/")) { base = "controller/"; file = file.substring(3); }
        else { send(out, 404, "text/plain", "nicht gefunden".getBytes("UTF-8")); return; }
        file = URLDecoder.decode(file, "UTF-8");
        if (file.contains("..")) { send(out, 403, "text/plain", "nein".getBytes("UTF-8")); return; }
        try {
            InputStream a = assets.open(base + file);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = a.read(buf)) > 0) bo.write(buf, 0, n);
            a.close();
            send(out, 200, mime(file), bo.toByteArray());
        } catch (IOException e) {
            send(out, 404, "text/plain", "nicht gefunden".getBytes("UTF-8"));
        }
    }

    private static String param(String query, String key) {
        for (String kv : query.split("&")) {
            int i = kv.indexOf('=');
            if (i > 0 && kv.substring(0, i).equals(key)) return kv.substring(i + 1);
        }
        return null;
    }

    private static String mime(String f) {
        if (f.endsWith(".html")) return "text/html; charset=utf-8";
        if (f.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (f.endsWith(".css")) return "text/css; charset=utf-8";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".woff2")) return "font/woff2";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private static void json(OutputStream out, String s) throws IOException {
        send(out, 200, "application/json", s.getBytes("UTF-8"));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        String status = code == 200 ? "OK" : code == 404 ? "Not Found" : "Forbidden";
        String head = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes("UTF-8"));
        out.write(body);
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 8192) break;
        }
        if (c < 0 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }
}
