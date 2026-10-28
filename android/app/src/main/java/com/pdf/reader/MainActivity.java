package com.pdf.reader;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    private Uri pendingPdf;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfFilesPlugin.class);
        capturePdfIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        capturePdfIntent(intent);
        if (pendingPdf != null && bridge != null) {
            PluginHandle handle = bridge.getPlugin("PdfFiles");
            if (handle != null && handle.getInstance() instanceof PdfFilesPlugin) {
                ((PdfFilesPlugin) handle.getInstance()).notifyIncomingPdf();
            }
        }
    }

    private synchronized void capturePdfIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        if (intent.getData() == null) return;
        Uri uri = intent.getData();
        if (!"content".equals(uri.getScheme()) && !"file".equals(uri.getScheme())) return;
        pendingPdf = uri;
    }

    public synchronized Uri takePendingPdf() {
        Uri next = pendingPdf;
        pendingPdf = null;
        return next;
    }
}
