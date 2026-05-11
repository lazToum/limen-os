import 'package:flutter/material.dart';

/// Screen-size breakpoints for LIMEN OS companion app.
enum FormFactor { phone, tablet, desktop }

extension BreakpointX on BuildContext {
  double get screenWidth => MediaQuery.sizeOf(this).width;

  FormFactor get formFactor {
    final w = screenWidth;
    if (w < 600) return FormFactor.phone;
    if (w < 1200) return FormFactor.tablet;
    return FormFactor.desktop;
  }

  bool get isPhone => formFactor == FormFactor.phone;
  bool get isTablet => formFactor == FormFactor.tablet;
  bool get isDesktop => formFactor == FormFactor.desktop;
  bool get isWide => !isPhone; // tablet OR desktop
}
