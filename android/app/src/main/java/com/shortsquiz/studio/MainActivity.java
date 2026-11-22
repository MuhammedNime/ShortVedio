package com.shortsquiz.studio;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
    private static final int REQUEST_AUDIO_PERMISSION = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AndroidNativeBridge(), "AndroidNativeBridge");
        }
        ensureAudioPermission();
    }

    private void ensureAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQUEST_AUDIO_PERMISSION
            );
        }
    }

    private byte[] decodeBase64Payload(String base64Data) {
        String clean = base64Data;
        int commaIdx = clean.indexOf(',');
        if (commaIdx >= 0) {
            clean = clean.substring(commaIdx + 1);
        }
        return Base64.decode(clean, Base64.DEFAULT);
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return "shorts-quiz-" + System.currentTimeMillis() + ".webm";
        }
        return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    public class AndroidNativeBridge {
        @JavascriptInterface
        public boolean requestAudioPermission() {
            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                return true;
            }
            runOnUiThread(MainActivity.this::ensureAudioPermission);
            return false;
        }

        @JavascriptInterface
        public String saveFile(String base64Data, String fileName, String mimeType) {
            String safeName = sanitizeFileName(fileName);
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                    ? mimeType.split(";")[0].trim()
                    : "application/octet-stream";
            try {
                byte[] bytes = decodeBase64Payload(base64Data);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ShortsQuizStudio");
                    ContentResolver resolver = getContentResolver();
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        return "{\"ok\":false,\"error\":\"Failed to create download entry\"}";
                    }
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) {
                            return "{\"ok\":false,\"error\":\"Failed to open output stream\"}";
                        }
                        out.write(bytes);
                        out.flush();
                    }
                } else {
                    File downloadsDir = new File(
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                            "ShortsQuizStudio"
                    );
                    if (!downloadsDir.exists()) {
                        downloadsDir.mkdirs();
                    }
                    File outFile = new File(downloadsDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                    MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[]{outFile.getAbsolutePath()},
                            new String[]{safeMime},
                            null
                    );
                }

                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "تم حفظ الملف في التنزيلات: " + safeName,
                        Toast.LENGTH_LONG
                ).show());
                return "{\"ok\":true,\"fileName\":\"" + safeName + "\"}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"" + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
            }
        }

        @JavascriptInterface
        public String shareFile(String base64Data, String fileName, String mimeType) {
            String safeName = sanitizeFileName(fileName);
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty())
                    ? mimeType.split(";")[0].trim()
                    : "application/octet-stream";
            try {
                byte[] bytes = decodeBase64Payload(base64Data);
                File shareDir = new File(getCacheDir(), "shared");
                if (!shareDir.exists()) {
                    shareDir.mkdirs();
                }
                File outFile = new File(shareDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(bytes);
                    fos.flush();
                }
                Uri contentUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        outFile
                );
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType(safeMime);
                    intent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(intent, "مشاركة / حفظ الملف"));
                });
                return "{\"ok\":true}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"" + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
            }
        }
    }
}
