//! TUI rendering — Ratatui layout and widgets.

use ratatui::{
    prelude::*,
    widgets::{Block, Borders, Gauge, List, ListItem, Paragraph, Tabs, Wrap},
};

use crate::app::{AppState, ChatRole, Tab};
use crate::sysinfo::{format_speed, format_uptime};

pub fn render(frame: &mut Frame, state: &AppState) {
    let area = frame.area();

    let chunks = Layout::vertical([
        Constraint::Length(3), // tab bar
        Constraint::Min(0),    // content
        Constraint::Length(3), // voice / command bar
        Constraint::Length(1), // status bar
    ])
    .split(area);

    render_tabs(frame, state, chunks[0]);
    render_content(frame, state, chunks[1]);
    render_command_bar(frame, state, chunks[2]);
    render_status_bar(frame, state, chunks[3]);
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

fn render_tabs(frame: &mut Frame, state: &AppState, area: Rect) {
    let titles: Vec<Line> = Tab::all()
        .iter()
        .map(|t| {
            if *t == state.active_tab {
                Line::from(format!(" {} ", t.label()))
                    .style(Style::default().fg(Color::Cyan).bold())
            } else {
                Line::from(format!(" {} ", t.label())).style(Style::default().fg(Color::DarkGray))
            }
        })
        .collect();

    let tabs = Tabs::new(titles)
        .block(
            Block::default()
                .title(" LIMEN OS ")
                .title_style(Style::default().fg(Color::Blue).bold())
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Blue)),
        )
        .highlight_style(Style::default().fg(Color::Cyan).bold())
        .select(
            Tab::all()
                .iter()
                .position(|t| *t == state.active_tab)
                .unwrap_or(0),
        );

    frame.render_widget(tabs, area);
}

// ── Content router ────────────────────────────────────────────────────────────

fn render_content(frame: &mut Frame, state: &AppState, area: Rect) {
    match state.active_tab {
        Tab::Home => render_home(frame, state, area),
        Tab::Apps => render_apps(frame, state, area),
        Tab::Voice => render_voice(frame, state, area),
        Tab::Ai => render_ai(frame, state, area),
        Tab::System => render_system(frame, state, area),
    }
}

// ── Home tab ──────────────────────────────────────────────────────────────────

fn render_home(frame: &mut Frame, state: &AppState, area: Rect) {
    let sys = &state.sys;
    let text = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("  LIMEN OS  ", Style::default().fg(Color::Cyan).bold()),
            Span::styled(
                "— AI-native terminal shell",
                Style::default().fg(Color::DarkGray),
            ),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::raw("  Session  "),
            Span::styled(
                &state.session_user,
                Style::default().fg(Color::Green).bold(),
            ),
            if !sys.hostname.is_empty() {
                Span::styled(
                    format!("@{}", sys.hostname),
                    Style::default().fg(Color::DarkGray),
                )
            } else {
                Span::raw("")
            },
        ]),
        Line::from(vec![
            Span::raw("  Model    "),
            Span::styled(&state.ai_model, Style::default().fg(Color::Cyan)),
        ]),
        Line::from(vec![
            Span::raw("  Scene    "),
            Span::styled(&state.scene, Style::default().fg(Color::Magenta)),
        ]),
        {
            if let Some(ref ev) = state.last_event {
                Line::from(vec![
                    Span::raw("  Event    "),
                    Span::styled(ev, Style::default().fg(Color::Yellow)),
                ])
            } else {
                Line::from("")
            }
        },
        Line::from(""),
        Line::from(vec![Span::styled(
            "  Quick stats  ",
            Style::default().fg(Color::Yellow),
        )]),
        Line::from(vec![
            Span::raw("    CPU    "),
            Span::styled(
                format!("{:.1}%", sys.cpu_pct),
                Style::default().fg(Color::Cyan),
            ),
            Span::raw(format!("  ({} cores)", sys.cpu_cores)),
        ]),
        Line::from(vec![
            Span::raw("    RAM    "),
            Span::styled(
                format!("{:.1} / {:.1} GiB", sys.mem_used_gib, sys.mem_total_gib),
                Style::default().fg(Color::Blue),
            ),
        ]),
        Line::from(vec![
            Span::raw("    Net    "),
            Span::styled(
                format!("↓ {}", format_speed(sys.net_down_bps)),
                Style::default().fg(Color::Green),
            ),
            Span::raw("  "),
            Span::styled(
                format!("↑ {}", format_speed(sys.net_up_bps)),
                Style::default().fg(Color::Yellow),
            ),
        ]),
        Line::from(vec![
            Span::raw("    Uptime "),
            Span::raw(format_uptime(sys.uptime_secs)),
        ]),
        Line::from(""),
        Line::from(vec![Span::styled(
            "  Keyboard  ",
            Style::default().fg(Color::Yellow),
        )]),
        Line::from("    Tab / Shift+Tab      switch tabs"),
        Line::from("    Enter  (ai tab)      open chat"),
        Line::from("    / or Ctrl+K          command bar"),
        Line::from("    ↑↓ + Enter  (apps)   launch app"),
        Line::from("    Ctrl+Q               quit"),
    ];

    let p = Paragraph::new(text).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Blue)),
    );
    frame.render_widget(p, area);
}

// ── Apps tab ──────────────────────────────────────────────────────────────────

fn render_apps(frame: &mut Frame, state: &AppState, area: Rect) {
    let chunks = Layout::vertical([
        Constraint::Length(3), // filter bar
        Constraint::Min(0),    // list
    ])
    .split(area);

    // Filter input
    let filter_text = format!(
        " 🔍 {}{}",
        state.app_filter,
        if state.active_tab == Tab::Apps && !state.input_active {
            "█"
        } else {
            ""
        }
    );
    let filter = Paragraph::new(filter_text).block(
        Block::default()
            .title(" Search apps — just type ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(filter, chunks[0]);

    // Filtered list
    let lower = state.app_filter.to_lowercase();
    let filtered: Vec<&crate::app::AppEntry> = state
        .apps
        .iter()
        .filter(|a| lower.is_empty() || a.name.to_lowercase().contains(&lower))
        .collect();

    // Clamp scroll
    let max_scroll = filtered.len().saturating_sub(1);
    let scroll = state.app_scroll.min(max_scroll);

    // Visible window
    let visible = chunks[1].height.saturating_sub(2) as usize;
    let start = scroll.saturating_sub(visible / 2);
    let end = (start + visible).min(filtered.len());

    let items: Vec<ListItem> = filtered[start..end]
        .iter()
        .enumerate()
        .map(|(i, app)| {
            let idx = start + i;
            let cat = app.categories.split(';').next().unwrap_or("").trim();
            let style = if idx == scroll {
                Style::default().fg(Color::Black).bg(Color::Cyan)
            } else {
                Style::default().fg(Color::White)
            };
            let cat_span = if cat.is_empty() {
                Span::raw("")
            } else {
                Span::styled(format!("  {}", cat), Style::default().fg(Color::DarkGray))
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("  {} ", app.name), style),
                cat_span,
            ]))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .title(format!(
                " Apps ({}) — ↑↓ navigate · Enter launch ",
                filtered.len()
            ))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Blue)),
    );
    frame.render_widget(list, chunks[1]);
}

// ── Voice tab ─────────────────────────────────────────────────────────────────

fn render_voice(frame: &mut Frame, state: &AppState, area: Rect) {
    let chunks = Layout::vertical([
        Constraint::Length(5), // last voice transcript + last event
        Constraint::Min(0),    // notifications
    ])
    .split(area);

    // ── Voice status ──
    let transcript = if state.voice_text.is_empty() {
        Span::styled(
            "  (no transcript yet)",
            Style::default().fg(Color::DarkGray),
        )
    } else {
        Span::styled(
            format!("  {}", state.voice_text),
            Style::default().fg(Color::White),
        )
    };
    let last_ev = if let Some(ref ev) = state.last_event {
        Line::from(vec![
            Span::styled("  Last  ", Style::default().fg(Color::Yellow)),
            Span::styled(ev, Style::default().fg(Color::Cyan)),
        ])
    } else {
        Line::from(vec![Span::styled(
            "  Use / or Ctrl+K to type commands",
            Style::default().fg(Color::DarkGray),
        )])
    };

    let status = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("  Voice  ", Style::default().fg(Color::Cyan).bold()),
            transcript,
        ]),
        Line::from(""),
        last_ev,
    ])
    .block(
        Block::default()
            .title(" Voice / Commands ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)),
    );
    frame.render_widget(status, chunks[0]);

    // ── Notifications ──
    let items: Vec<ListItem> = if state.notifications.is_empty() {
        vec![ListItem::new(Line::from(vec![Span::styled(
            "  No notifications yet.",
            Style::default().fg(Color::DarkGray),
        )]))]
    } else {
        state
            .notifications
            .iter()
            .map(|(title, body)| {
                ListItem::new(vec![
                    Line::from(vec![
                        Span::raw("  "),
                        Span::styled(title, Style::default().fg(Color::Yellow).bold()),
                    ]),
                    Line::from(vec![
                        Span::raw("    "),
                        Span::styled(body, Style::default().fg(Color::White)),
                    ]),
                ])
            })
            .collect()
    };

    let list = List::new(items).block(
        Block::default()
            .title(format!(" Notifications ({}) ", state.notifications.len()))
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Blue)),
    );
    frame.render_widget(list, chunks[1]);
}

// ── AI chat tab ───────────────────────────────────────────────────────────────

fn render_ai(frame: &mut Frame, state: &AppState, area: Rect) {
    let chunks = Layout::vertical([
        Constraint::Min(0),    // chat history
        Constraint::Length(3), // input line
    ])
    .split(area);

    // Build chat lines
    let mut lines: Vec<Line> = Vec::new();

    if state.chat.is_empty() {
        lines.push(Line::from(""));
        lines.push(Line::from(vec![Span::styled(
            "  LIMEN AI  ",
            Style::default().fg(Color::Cyan).bold(),
        )]));
        lines.push(Line::from(""));
        lines.push(Line::from(vec![Span::styled(
            "  Press Enter to start chatting.",
            Style::default().fg(Color::DarkGray),
        )]));
        lines.push(Line::from(vec![Span::styled(
            "  Multi-model: Claude → GPT-4o → Gemini → Deepseek → Groq",
            Style::default().fg(Color::DarkGray),
        )]));
    }

    for msg in &state.chat {
        match msg.role {
            ChatRole::User => {
                lines.push(Line::from(vec![Span::styled(
                    "  You  ",
                    Style::default().fg(Color::Green).bold(),
                )]));
                for line in msg.content.lines() {
                    lines.push(Line::from(vec![
                        Span::raw("  "),
                        Span::styled(line, Style::default().fg(Color::White)),
                    ]));
                }
            }
            ChatRole::Assistant => {
                let meta = format!(
                    "  {}  {}",
                    msg.model.as_deref().unwrap_or("AI"),
                    msg.latency_ms
                        .map(|ms| {
                            let t_in = msg.tokens_in.unwrap_or(0);
                            let t_out = msg.tokens_out.unwrap_or(0);
                            format!("[{:.1}s · {}→{} tok]", ms as f64 / 1000.0, t_in, t_out)
                        })
                        .unwrap_or_default()
                );
                lines.push(Line::from(vec![Span::styled(
                    meta,
                    Style::default().fg(Color::Cyan).dim(),
                )]));
                for line in msg.content.lines() {
                    lines.push(Line::from(vec![
                        Span::raw("  "),
                        Span::styled(line, Style::default().fg(Color::Cyan)),
                    ]));
                }
            }
            ChatRole::Error => {
                lines.push(Line::from(vec![Span::styled(
                    format!("  ✗ {}", msg.content),
                    Style::default().fg(Color::Red),
                )]));
            }
        }
        lines.push(Line::from(""));
    }

    // Auto-scroll to bottom
    let chat_height = chunks[0].height.saturating_sub(2) as usize;
    let total = lines.len();
    let scroll = if total > chat_height {
        (total - chat_height) as u16
    } else {
        0
    };

    let chat = Paragraph::new(Text::from(lines))
        .block(
            Block::default()
                .title(format!(" AI Chat — {} ", state.ai_model))
                .title_style(Style::default().fg(Color::Cyan))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Cyan)),
        )
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));
    frame.render_widget(chat, chunks[0]);

    // Input area
    let (input_text, input_style, border_style) = if state.ai_thinking {
        (
            format!(" ⟳ Thinking… ({})", state.ai_model),
            Style::default().fg(Color::Yellow),
            Style::default().fg(Color::Yellow),
        )
    } else if state.input_active {
        (
            format!(" > {}_", state.input),
            Style::default().fg(Color::White),
            Style::default().fg(Color::Cyan),
        )
    } else {
        (
            " Press Enter to chat · Esc to cancel".into(),
            Style::default().fg(Color::DarkGray),
            Style::default().fg(Color::DarkGray),
        )
    };

    let input = Paragraph::new(input_text).style(input_style).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(border_style),
    );
    frame.render_widget(input, chunks[1]);
}

// ── System tab ────────────────────────────────────────────────────────────────

fn render_system(frame: &mut Frame, state: &AppState, area: Rect) {
    let sys = &state.sys;

    let chunks = Layout::vertical([
        Constraint::Length(3), // CPU
        Constraint::Length(3), // Memory
        Constraint::Length(3), // Disk
        Constraint::Min(4),    // Network + info
    ])
    .split(area);

    // CPU gauge
    let cpu_pct = sys.cpu_pct.clamp(0.0, 100.0) as u16;
    let cpu_gauge = Gauge::default()
        .block(
            Block::default()
                .title(format!(" CPU  {}%  ({} cores) ", cpu_pct, sys.cpu_cores))
                .title_style(Style::default().fg(Color::Cyan))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Cyan)),
        )
        .gauge_style(Style::default().fg(Color::Cyan).bg(Color::DarkGray))
        .percent(cpu_pct)
        .label(Span::raw(""));
    frame.render_widget(cpu_gauge, chunks[0]);

    // Memory gauge
    let mem_pct = if sys.mem_total_gib > 0.0 {
        (sys.mem_used_gib / sys.mem_total_gib * 100.0).clamp(0.0, 100.0) as u16
    } else {
        0
    };
    let mem_gauge = Gauge::default()
        .block(
            Block::default()
                .title(format!(
                    " Memory  {:.1} / {:.1} GiB  ({}%) ",
                    sys.mem_used_gib, sys.mem_total_gib, mem_pct
                ))
                .title_style(Style::default().fg(Color::Blue))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Blue)),
        )
        .gauge_style(Style::default().fg(Color::Blue).bg(Color::DarkGray))
        .percent(mem_pct)
        .label(Span::raw(""));
    frame.render_widget(mem_gauge, chunks[1]);

    // Disk gauge
    let disk_pct = sys.disk_used_pct.clamp(0.0, 100.0) as u16;
    let disk_gauge = Gauge::default()
        .block(
            Block::default()
                .title(format!(
                    " Disk  {:.1}%  ({:.0} GiB total) ",
                    sys.disk_used_pct, sys.disk_total_gib
                ))
                .title_style(Style::default().fg(Color::Yellow))
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Yellow)),
        )
        .gauge_style(Style::default().fg(Color::Yellow).bg(Color::DarkGray))
        .percent(disk_pct)
        .label(Span::raw(""));
    frame.render_widget(disk_gauge, chunks[2]);

    // Network + system info
    let down_str = format_speed(sys.net_down_bps);
    let up_str = format_speed(sys.net_up_bps);
    let net_text = vec![
        Line::from(vec![
            Span::styled("  Network  ", Style::default().fg(Color::Green).bold()),
            Span::styled(
                format!("↓ {}  ", down_str),
                Style::default().fg(Color::Green),
            ),
            Span::styled(format!("↑ {}", up_str), Style::default().fg(Color::Yellow)),
        ]),
        Line::from(vec![
            Span::styled("  Load     ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!(
                    "{:.2}  {:.2}  {:.2}  (1m / 5m / 15m)",
                    sys.load1, sys.load5, sys.load15
                ),
                Style::default().fg(Color::White),
            ),
        ]),
        Line::from(vec![
            Span::styled("  Uptime   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format_uptime(sys.uptime_secs),
                Style::default().fg(Color::White),
            ),
        ]),
        Line::from(vec![
            Span::styled("  Host     ", Style::default().fg(Color::DarkGray)),
            Span::styled(&sys.hostname, Style::default().fg(Color::Cyan)),
        ]),
    ];

    let net_block = Paragraph::new(Text::from(net_text)).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(net_block, chunks[3]);
}

// ── Command / voice bar ───────────────────────────────────────────────────────

fn render_command_bar(frame: &mut Frame, state: &AppState, area: Rect) {
    let (text, style) = if state.active_tab == Tab::Ai {
        // AI tab: handled inside render_ai — just show a hint here
        if state.ai_thinking {
            (
                format!(" ⟳ Thinking… ({})", state.ai_model),
                Style::default().fg(Color::Yellow),
            )
        } else {
            (
                " ↑ AI tab active · Enter to chat".into(),
                Style::default().fg(Color::DarkGray),
            )
        }
    } else if state.input_active {
        (
            format!(" > {}_", state.input),
            Style::default().fg(Color::White),
        )
    } else if state.voice_listening {
        (
            format!(" ● {}", state.voice_text),
            Style::default().fg(Color::Green),
        )
    } else {
        (
            " ○  Say \"Hey Limen…\"  or  / for command".into(),
            Style::default().fg(Color::DarkGray),
        )
    };

    let border_style = if state.input_active {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::Blue)
    };

    let bar = Paragraph::new(text).style(style).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(border_style),
    );
    frame.render_widget(bar, area);
}

// ── Status bar ────────────────────────────────────────────────────────────────

fn render_status_bar(frame: &mut Frame, state: &AppState, area: Rect) {
    let sys = &state.sys;
    let cpu = format!(" CPU {:.0}% ", sys.cpu_pct);
    let mem = format!("| RAM {:.1}/{:.1}G ", sys.mem_used_gib, sys.mem_total_gib);
    let net = format!(
        "| ↓{}  ↑{} ",
        format_speed(sys.net_down_bps),
        format_speed(sys.net_up_bps)
    );
    let user = format!("| {}@{} ", state.session_user, sys.hostname);
    let model = format!("| {} ", state.ai_model);

    let bar = Paragraph::new(Line::from(vec![
        Span::styled(cpu, Style::default().fg(Color::Cyan)),
        Span::styled(mem, Style::default().fg(Color::Blue)),
        Span::styled(net, Style::default().fg(Color::Green)),
        Span::styled(user, Style::default().fg(Color::White)),
        Span::styled(model, Style::default().fg(Color::DarkGray)),
    ]))
    .style(Style::default().bg(Color::Black));
    frame.render_widget(bar, area);
}
