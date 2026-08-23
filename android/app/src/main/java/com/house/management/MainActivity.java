package com.house.management;

import com.getcapacitor.BridgeActivity;
import com.house.management.plugins.FileOpenerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FileOpenerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
