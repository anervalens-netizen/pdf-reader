package com.pdf.reader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.OutputStream;

/**
 * Android SAF document export. Files are written only after the user chooses
 * the destination. No broad storage permissions and no silent download.
 */
@CapacitorPlugin(name = "PdfFiles")
public class PdfFilesPlugin extends Plugin {

    @PluginMethod
    public void savePdf(PluginCall call) {
        String name = call.getString("fileName", "document.pdf");
        String payload = call.getString("base64");
        if (payload == null || payload.isEmpty()) {
            call.reject("Missing PDF content");
            return;
        }
        if (name == null || name.trim().isEmpty()) name = "document.pdf";
        // ACTION_CREATE_DOCUMENT rejects unsafe path segments.
        name = name.replace('/', '_').replace('\\', '_');
        if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) name += ".pdf";

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK ||
                result.getData() == null || result.getData().getData() == null) {
            response.put("canceled", true);
            call.resolve(response);
            return;
        }

        Uri uri = result.getData().getData();
        try {
            String payload = call.getString("base64");
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (stream == null) throw new java.io.IOException("Cannot open destination");
                stream.write(bytes);
                stream.flush();
            }
            response.put("canceled", false);
            response.put("path", uri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not save PDF", error);
        }
    }
}
