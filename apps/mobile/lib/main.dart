import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dynamic_color/dynamic_color.dart';
import 'screens/home.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // On web, skip platform-channel initialisation (camera/mic via WebRTC only).
  if (!kIsWeb) {
    _initNative();
  }
  runApp(const ProviderScope(child: LimenApp()));
}

/// Native-only startup (permissions, background tasks, etc.)
void _initNative() {
  // Placeholder — add permission_handler requests here when needed.
}

class LimenApp extends ConsumerWidget {
  const LimenApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DynamicColorBuilder(
      builder: (lightDynamic, darkDynamic) {
        final light =
            lightDynamic ??
            ColorScheme.fromSeed(
              seedColor: const Color(0xFF3B82F6), // limen blue
              brightness: Brightness.light,
            );
        final dark =
            darkDynamic ??
            ColorScheme.fromSeed(
              seedColor: const Color(0xFF3B82F6),
              brightness: Brightness.dark,
            );

        return MaterialApp(
          title: 'LIMEN OS',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: light,
            useMaterial3: true,
            navigationRailTheme: NavigationRailThemeData(
              backgroundColor: light.surfaceContainerLow,
            ),
          ),
          darkTheme: ThemeData(
            colorScheme: dark,
            useMaterial3: true,
            navigationRailTheme: NavigationRailThemeData(
              backgroundColor: dark.surfaceContainerLow,
            ),
          ),
          themeMode: ThemeMode.system,
          home: const HomeScreen(),
        );
      },
    );
  }
}
