package com.pdf.reader;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(PdfFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
