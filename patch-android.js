// Android projesine izinleri, bildirim simgesini ve dosya erisim eklentisini ekler.
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
const pkg = cfg.appId;

// 1) Manifest izinleri
const f = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(f, 'utf8');
const perms = [
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE'
];
let add = '';
for (const p of perms) if (!m.includes('"' + p + '"')) add += '    <uses-permission android:name="' + p + '" />\n';
if (!m.includes('android.hardware.camera')) add += '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n';
m = m.replace('</manifest>', add + '</manifest>');
fs.writeFileSync(f, m);

// 2) Bildirim simgesi
const dir = 'android/app/src/main/res/drawable';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/ic_stat_icon.xml',
'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M4,20h4V12H4z M10,20h4V6h-4z M16,20h4V3h-4z"/></vector>');

// 3) Dosya erisim eklentisi (Tum dosyalara erisim iznini kontrol eder ve ayar sayfasini acar)
const jdir = 'android/app/src/main/java/' + pkg.replace(/\./g, '/');
fs.mkdirSync(jdir, { recursive: true });
fs.writeFileSync(jdir + '/StorageAccessPlugin.java', `package ${pkg};

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;

@CapacitorPlugin(name = "StorageAccess")
public class StorageAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= 30) {
            return Environment.isExternalStorageManager();
        }
        return getContext().checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void request(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception e) {
                    Intent i2 = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i2);
                }
            } else {
                getActivity().requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 9001);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("izin sayfasi acilamadi");
        }
    }

    // Cihazda verilen adli klasoru arar (once bilinen yerler, sonra en fazla 4 seviye).
    @PluginMethod
    public void find(PluginCall call) {
        String name = call.getString("name", "");
        File root = Environment.getExternalStorageDirectory();
        File hit = null;
        String[] spots = {"", "Download", "Documents", "Downloads"};
        for (String s : spots) {
            File base = s.isEmpty() ? root : new File(root, s);
            File c = child(base, name);
            if (c != null) {
                hit = c;
                break;
            }
        }
        if (hit == null) {
            hit = bfs(root, name);
        }
        JSObject r = new JSObject();
        r.put("found", hit != null);
        r.put("path", hit == null ? "" : hit.getAbsolutePath());
        call.resolve(r);
    }

    private File child(File base, String name) {
        File[] l = base.listFiles();
        if (l == null) {
            return null;
        }
        for (File f : l) {
            if (f.isDirectory() && f.getName().equalsIgnoreCase(name)) {
                return f;
            }
        }
        return null;
    }

    private File bfs(File root, String name) {
        ArrayList<File> level = new ArrayList<File>();
        level.add(root);
        int visited = 0;
        for (int d = 0; d < 4; d++) {
            ArrayList<File> next = new ArrayList<File>();
            for (File dir : level) {
                File[] l = dir.listFiles();
                if (l == null) {
                    continue;
                }
                for (File f : l) {
                    if (!f.isDirectory()) {
                        continue;
                    }
                    String n = f.getName();
                    if (n.startsWith(".") || n.equals("Android")) {
                        continue;
                    }
                    if (n.equalsIgnoreCase(name)) {
                        return f;
                    }
                    next.add(f);
                    visited++;
                    if (visited > 4000) {
                        return null;
                    }
                }
            }
            level = next;
        }
        return null;
    }

    // Klasordeki PDF'leri uygulamanin kendi alanina kopyalar (degismeyenleri atlar, silinenleri kaldirir).
    @PluginMethod
    public void sync(PluginCall call) {
        String path = call.getString("path", "");
        File src = new File(path);
        if (!src.isDirectory() || src.listFiles() == null) {
            call.reject("klasor okunamadi");
            return;
        }
        File dest = new File(getContext().getFilesDir(), "sinav");
        dest.mkdirs();
        JSArray arr = new JSArray();
        HashSet<String> keep = new HashSet<String>();
        int[] cnt = new int[]{0, 0};
        try {
            walk(src, "", 0, dest, arr, keep, cnt);
            prune(dest, "", keep, cnt);
        } catch (Exception e) {
            call.reject("tarama hatasi: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("files", arr);
        r.put("added", cnt[0]);
        r.put("removed", cnt[1]);
        call.resolve(r);
    }

    private void walk(File dir, String rel, int depth, File dest, JSArray arr, HashSet<String> keep, int[] cnt) throws Exception {
        File[] l = dir.listFiles();
        if (l == null) {
            return;
        }
        for (File f : l) {
            String n = f.getName();
            if (n.startsWith(".")) {
                continue;
            }
            if (f.isDirectory()) {
                if (depth < 3) {
                    walk(f, rel + n + "/", depth + 1, dest, arr, keep, cnt);
                }
                continue;
            }
            if (!n.toLowerCase().endsWith(".pdf")) {
                continue;
            }
            File out = new File(dest, rel + n);
            keep.add(rel + n);
            if (!(out.exists() && out.length() == f.length() && out.lastModified() == f.lastModified())) {
                File parent = out.getParentFile();
                if (parent != null) {
                    parent.mkdirs();
                }
                copy(f, out);
                out.setLastModified(f.lastModified());
                cnt[0]++;
            }
            JSObject o = new JSObject();
            o.put("name", n);
            o.put("rel", rel + n);
            o.put("size", f.length());
            o.put("mtime", f.lastModified());
            o.put("app", out.getAbsolutePath());
            arr.put(o);
        }
    }

    private void copy(File a, File b) throws Exception {
        InputStream in = new FileInputStream(a);
        OutputStream os = new FileOutputStream(b);
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) {
            os.write(buf, 0, n);
        }
        os.close();
        in.close();
    }

    private void prune(File dir, String rel, HashSet<String> keep, int[] cnt) {
        File[] l = dir.listFiles();
        if (l == null) {
            return;
        }
        for (File f : l) {
            if (f.isDirectory()) {
                prune(f, rel + f.getName() + "/", keep, cnt);
                continue;
            }
            if (!keep.contains(rel + f.getName())) {
                if (f.delete()) {
                    cnt[1]++;
                }
            }
        }
    }
}
`);
fs.writeFileSync(jdir + '/MainActivity.java', `package ${pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
console.log('Izinler, bildirim simgesi ve dosya erisim eklentisi eklendi.');
