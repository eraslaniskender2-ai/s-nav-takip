// Android projesine izinleri ve bildirim simgesini ekler.
const fs = require('fs');
const f = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(f, 'utf8');
const perms = ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'];
let add = '';
for (const p of perms) if (!m.includes('"' + p + '"')) add += '    <uses-permission android:name="' + p + '" />\n';
if (!m.includes('android.hardware.camera')) add += '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n';
m = m.replace('</manifest>', add + '</manifest>');
fs.writeFileSync(f, m);
const dir = 'android/app/src/main/res/drawable';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/ic_stat_icon.xml',
'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M4,20h4V12H4z M10,20h4V6h-4z M16,20h4V3h-4z"/></vector>');
console.log('Android izinleri ve bildirim simgesi eklendi.');
