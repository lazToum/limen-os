import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../utils/breakpoints.dart';

/// Nav destination descriptor used by [ResponsiveScaffold].
class NavDest {
  const NavDest({
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  final String label;
  final Widget icon;
  final Widget selectedIcon;
}

/// A scaffold that adapts navigation chrome to the current screen size:
///
///   Phone   (< 600 px)   → [NavigationBar]  at the bottom
///   Tablet  (600–1200)   → [NavigationRail] on the left (compact, icons only)
///   Desktop (≥ 1200 px)  → [NavigationRail] on the left (extended, with labels)
///
/// Drop-in replacement for a plain [Scaffold] with bottom nav.
class ResponsiveScaffold extends StatelessWidget {
  const ResponsiveScaffold({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.body,
    this.appBar,
    this.floatingActionButton,
    this.topSlot,
  });

  final List<NavDest> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? floatingActionButton;

  /// Optional widget slotted above the page body (e.g., [ConnectionBanner]).
  final Widget? topSlot;

  @override
  Widget build(BuildContext context) {
    final ff = context.formFactor;
    final cs = Theme.of(context).colorScheme;

    return switch (ff) {
      FormFactor.phone => _PhoneLayout(this, cs),
      FormFactor.tablet => _RailLayout(this, cs, extended: false),
      FormFactor.desktop => _RailLayout(this, cs, extended: true),
    };
  }
}

// ── Phone: bottom NavigationBar ──────────────────────────────────────────────

class _PhoneLayout extends StatelessWidget {
  const _PhoneLayout(this.s, this.cs);
  final ResponsiveScaffold s;
  final ColorScheme cs;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: cs.surface,
      appBar: s.appBar,
      floatingActionButton: s.floatingActionButton,
      body: Column(
        children: [if (s.topSlot != null) s.topSlot!, Expanded(child: s.body)],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: s.selectedIndex,
        onDestinationSelected: s.onDestinationSelected,
        destinations:
            s.destinations
                .map(
                  (d) => NavigationDestination(
                    icon: d.icon,
                    selectedIcon: d.selectedIcon,
                    label: d.label,
                  ),
                )
                .toList(),
      ),
    );
  }
}

// ── Tablet / Desktop: NavigationRail on the left ─────────────────────────────

class _RailLayout extends StatelessWidget {
  const _RailLayout(this.s, this.cs, {required this.extended});
  final ResponsiveScaffold s;
  final ColorScheme cs;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: cs.surface,
      appBar: s.appBar,
      floatingActionButton: s.floatingActionButton,
      body: Row(
        children: [
          NavigationRail(
            extended: extended,
            selectedIndex: s.selectedIndex,
            onDestinationSelected: s.onDestinationSelected,
            backgroundColor: cs.surfaceContainerLow,
            indicatorColor: cs.secondaryContainer,
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: _LimenLogoMark(color: cs.primary),
            ),
            destinations:
                s.destinations
                    .map(
                      (d) => NavigationRailDestination(
                        icon: d.icon,
                        selectedIcon: d.selectedIcon,
                        label: Text(d.label),
                      ),
                    )
                    .toList(),
          ),
          const VerticalDivider(width: 1, thickness: 1),
          Expanded(
            child: Column(
              children: [
                if (s.topSlot != null) s.topSlot!,
                Expanded(child: s.body),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Logo mark ─────────────────────────────────────────────────────────────────

class _LimenLogoMark extends StatelessWidget {
  const _LimenLogoMark({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 36,
      height: 36,
      child: CustomPaint(painter: _LogoPainter(color: color)),
    );
  }
}

class _LogoPainter extends CustomPainter {
  _LogoPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p =
        Paint()
          ..color = color
          ..style = PaintingStyle.fill;
    final r = size.width / 2;
    // Central circle
    canvas.drawCircle(Offset(r, r), r * 0.32, p);
    // Four orbital dots
    for (final angle in [0.0, 90.0, 180.0, 270.0]) {
      final rad = angle * math.pi / 180;
      final dx = r + r * 0.72 * math.cos(rad);
      final dy = r + r * 0.72 * math.sin(rad);
      canvas.drawCircle(
        Offset(dx, dy),
        r * 0.14,
        p..color = color.withValues(alpha: 0.55),
      );
    }
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.color != color;
}
