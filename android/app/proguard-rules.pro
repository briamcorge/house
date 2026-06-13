# 房屋管理 ProGuard 规则

# Capacitor - 保留插件反射调用
-keep @com.getcapacitor.annotation.CapacitorPlugin public class *
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin { *; }

# WebView JavaScript 接口
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 保留行号信息（方便排查崩溃）
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
