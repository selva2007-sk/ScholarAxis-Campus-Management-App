package com.manigandan.scholaraxis;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // This line prevents the webview from overlapping with the status bar.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
