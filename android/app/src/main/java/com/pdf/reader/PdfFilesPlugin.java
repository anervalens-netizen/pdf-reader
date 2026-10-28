package com.pdf.reader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.OpenableColumns;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
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
    private static final int MAX_PDF_BYTES = 32 * 1024 * 1024;

    private JSObject readIncoming(Uri uri) throws Exception {
        if (uri == null) return null;
        String name = "document.pdf";
        try (Cursor cursor = getContext().getContentResolver().query(
                uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int col = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (col >= 0 && cursor.getString(col) != null) name = cursor.getString(col);
            }
        } catch (Exception ignored) {
            // Some providers do not offer display name metadata.
        }
        name = name.replace('/', '_').replace('\\', '_');
        if (name.length() > 180) name = name.substring(name.length() - 180);
        if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) name += ".pdf";
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) throw new java.io.IOException("Cannot open PDF stream");
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (data.size() + count > MAX_PDF_BYTES)
                    throw new java.io.IOException("PDF too large for mobile import (32 MB limit)");
                data.write(buffer, 0, count);
            }
        }
        JSObject response = new JSObject();
        response.put("available", true);
        response.put("fileName", name);
        response.put("base64", Base64.encodeToString(data.toByteArray(), Base64.NO_WRAP));
        return response;
    }

    @PluginMethod
    public void getPendingPdf(PluginCall call) {
        Uri uri = ((MainActivity) getActivity()).takePendingPdf();
        try {
            if (uri == null) {
                JSObject result = new JSObject();
                result.put("available", false);
                call.resolve(result);
                return;
            }
            call.resolve(readIncoming(uri));
        } catch (Exception error) {
            call.reject("Could not import the external PDF", error);
        }
    }

    public void notifyIncomingPdf() {
        Uri uri = ((MainActivity) getActivity()).takePendingPdf();
        if (uri == null) return;
        new Thread(() -> {
            try {
                JSObject incoming = readIncoming(uri);
                if (incoming != null) notifyListeners("pdfOpened", incoming, true);
            } catch (Exception error) {
                JSObject failure = new JSObject();
                failure.put("message", error.getMessage());
                notifyListeners("pdfOpenError", failure, true);
            }
        }, "pdf-external-import").start();
    }

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
