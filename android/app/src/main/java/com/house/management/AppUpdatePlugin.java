package com.house.management;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

  private static final String VERSION_URL =
    "https://gitee.com/c94138228/house/raw/master/version.json";

  /**
   * 从 Gitee raw 获取最新的版本信息（原生 HTTP，无 CORS 限制）
   */
  @PluginMethod
  public void checkVersion(PluginCall call) {
    new Thread(
      () -> {
        try {
          HttpURLConnection conn = (HttpURLConnection) new URL(VERSION_URL).openConnection();
          conn.setConnectTimeout(10000);
          conn.setReadTimeout(10000);
          conn.setRequestMethod("GET");
          conn.connect();

          BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getInputStream(), "UTF-8")
          );
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = reader.readLine()) != null) {
            sb.append(line);
          }
          reader.close();
          conn.disconnect();

          JSONObject json = new JSONObject(sb.toString());
          JSObject result = new JSObject();
          result.put("version", json.getString("version"));
          result.put("apkUrl", json.optString("apkUrl", ""));
          result.put("notes", json.optString("notes", ""));
          call.resolve(result);
        } catch (Exception e) {
          call.reject("获取版本信息失败: " + e.getMessage());
        }
      }
    ).start();
  }

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.isEmpty()) {
      call.reject("URL is required");
      return;
    }

    new Thread(
      () -> {
        try {
          File cacheDir = getContext().getCacheDir();
          File apkFile = new File(cacheDir, "house-update.apk");

          // Download APK
          HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
          conn.setConnectTimeout(15000);
          conn.setReadTimeout(60000);
          conn.connect();

          InputStream in = conn.getInputStream();
          FileOutputStream out = new FileOutputStream(apkFile);

          byte[] buffer = new byte[8192];
          int len;
          while ((len = in.read(buffer)) != -1) {
            out.write(buffer, 0, len);
          }
          out.close();
          in.close();
          conn.disconnect();

          // Trigger install via FileProvider
          Uri apkUri =
            FileProvider.getUriForFile(
              getContext(),
              getContext().getPackageName() + ".fileprovider",
              apkFile
            );

          Intent intent = new Intent(Intent.ACTION_VIEW);
          intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
          intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

          getContext().startActivity(intent);
          call.resolve();
        } catch (Exception e) {
          call.reject("更新失败: " + e.getMessage());
        }
      }
    ).start();
  }
}
