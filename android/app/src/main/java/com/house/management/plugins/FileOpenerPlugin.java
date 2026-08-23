package com.house.management.plugins;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 用 ACTION_VIEW 打开文件（弹出系统"用以下应用打开"选择器）。
 * 与 Share 插件的 ACTION_SEND 不同：百度网盘等 App 只注册了 VIEW 接收器，
 * 因此分享菜单里看不到它们，但打开菜单里可以看到。
 */
@CapacitorPlugin(name = "FileOpener")
public class FileOpenerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String path = call.getString("path");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }
        File file = new File(path);
        if (!file.exists()) {
            call.reject("file not found: " + path);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(intent, "用以下应用打开"));
            JSObject result = new JSObject();
            result.put("value", uri.toString());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("open failed: " + e.getMessage());
        }
    }
}