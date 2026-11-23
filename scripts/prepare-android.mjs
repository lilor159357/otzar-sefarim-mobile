import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const androidDir = path.join(rootDir, "android");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
const stringsPath = path.join(androidDir, "app", "src", "main", "res", "values", "strings.xml");
const iconSrc = path.join(rootDir, "assets", "icon.png");

if (!fs.existsSync(androidDir)) {
  console.log("[prepare-android] android/ folder not found yet — run npx cap add android first.");
  process.exit(0);
}

if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, "utf8");
  const perms = [
    "android.permission.INTERNET",
    "android.permission.CAMERA",
    "android.permission.ACCESS_NETWORK_STATE",
  ];
  for (const perm of perms) {
    if (!xml.includes(perm)) {
      xml = xml.replace(
        "<application",
        `    <uses-permission android:name="${perm}" />\n\n    <application`
      );
    }
  }
  fs.writeFileSync(manifestPath, xml, "utf8");
  console.log("[prepare-android] Verified AndroidManifest permissions.");
}

if (fs.existsSync(stringsPath)) {
  let stringsXml = fs.readFileSync(stringsPath, "utf8");
  stringsXml = stringsXml
    .replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">אוצר ספרים</string>')
    .replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">אוצר ספרים</string>');
  fs.writeFileSync(stringsPath, stringsXml, "utf8");
  console.log("[prepare-android] Updated Hebrew app_name in strings.xml.");
}

if (fs.existsSync(iconSrc)) {
  const resDir = path.join(androidDir, "app", "src", "main", "res");
  const mipmapDirs = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"];
  for (const dirName of mipmapDirs) {
    const targetDir = path.join(resDir, dirName);
    if (fs.existsSync(targetDir)) {
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher.png"));
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher_round.png"));
      fs.copyFileSync(iconSrc, path.join(targetDir, "ic_launcher_foreground.png"));
    }
  }
  console.log("[prepare-android] Copied Otzar Sefarim launcher icons.");
}
