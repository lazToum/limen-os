# -*- mode: ruby -*-
# vi: set ft=ruby :
# LIMEN OS — Local development / kiosk VM
#
# Modes (LIMEN_VM_MODE):
#   kiosk  (default) — headless, Chromium kiosk on :6080 via noVNC
#   dev               — GNOME desktop + all build tools (VirtualBox: GUI window)
#   haos              — Debian 13, installs HA Supervised + Limen OS add-on
#
# Usage:
#   vagrant up                                    # kiosk (VirtualBox)
#   VAGRANT_DEFAULT_PROVIDER=libvirt vagrant up   # force libvirt
#   LIMEN_VM_MODE=dev vagrant up
#   LIMEN_VM_MODE=haos vagrant up
#   vagrant rsync                                 # re-push files after changes
#   vagrant halt / vagrant destroy

# ── VirtualBox storage-controller bug fix ─────────────────────────────────────
# https://github.com/hashicorp/vagrant/pull/13587
# https://github.com/hashicorp/vagrant/issues/13586
begin
  class VagrantPlugins::ProviderVirtualBox::Model::StorageController
    SCSI_CONTROLLER_TYPES = ["LsiLogic", "BusLogic", "VirtioSCSI"].map(&:freeze).freeze
  end
rescue NameError
  # VirtualBox provider not loaded — safe to ignore
end

VM_MODE   = ENV.fetch("LIMEN_VM_MODE",   "kiosk")
KIOSK_URL = ENV.fetch("LIMEN_KIOSK_URL", "http://localhost:1420")
HA_HOST   = ENV.fetch("HA_HOST",         "")

VM_RAM  = ENV.fetch("LIMEN_VM_RAM",  VM_MODE == "haos" ? "4096" : "8192").to_i
VM_CPUS = ENV.fetch("LIMEN_VM_CPUS", "4").to_i

# ── Box selection ─────────────────────────────────────────────────────────────
# bento boxes: tested on VirtualBox (x86_64 + arm64) and libvirt (x86_64).
# For libvirt on arm64 Linux hosts use: LIMEN_VM_BOX=generic/ubuntu2404
# haos mode stays on Debian 13 (HA Supervised requirement).
DEFAULT_BOX = VM_MODE == "haos" ? "bento/debian-13" : "bento/ubuntu-24.04"
VM_BOX = ENV.fetch("LIMEN_VM_BOX", DEFAULT_BOX)

Vagrant.configure("2") do |config|
  config.vm.box              = VM_BOX
  config.vm.hostname         = "limen-vm"
  config.vm.box_check_update = false

  # Disable auto Guest Additions update — we use rsync, not vbguest mounts
  config.vbguest.auto_update = false if Vagrant.has_plugin?("vagrant-vbguest")

  # Disable the default /vagrant mount (requires Guest Additions, not needed)
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # 100 GB disk — Rust + Bun + Flutter builds need the space
  config.vm.disk :disk, size: "100GB", primary: true

  # ── Shared folder — rsync (no Guest Additions needed) ────────────────────────
  # One-way host→guest push at `vagrant up`; re-sync with `vagrant rsync`.
  # --safe-links silently skips dangling symlinks (Flutter ephemeral dirs, etc.)
  config.vm.synced_folder ".", "/opt/limen-os",
    type:         "rsync",
    owner:        "vagrant",
    group:        "vagrant",
    rsync__args:  ["--verbose", "--archive", "--delete", "-z", "--safe-links",
                   "--no-owner", "--no-group"],
    rsync__exclude: [
      ".git/", "target/", "node_modules/", ".bun/",
      "dist/", ".cargo/", "android/", ".dart_tool/",
      "**/ephemeral/",
      "*.mov", "*.mp4", "*.mkv", "*.avi",
    ]

  # ── Port forwards ─────────────────────────────────────────────────────────────
  config.vm.network "forwarded_port", guest: 6080, host: 6080, id: "novnc"
  config.vm.network "forwarded_port", guest: 1420, host: 1420, id: "serve" unless VM_MODE == "haos"

  if VM_MODE != "haos"
    config.vm.network "forwarded_port", guest: 8123, host: 8123, id: "ha" if HA_HOST.empty?
  end

  if VM_MODE == "haos"
    config.vm.network "private_network",  ip: "192.168.56.2"
    config.vm.network "forwarded_port",   guest: 8123, host: 8123, id: "ha_ui"
    config.vm.network "forwarded_port",   guest: 1420, host: 1420, id: "limen_serve"
    config.vm.network "forwarded_port",   guest: 6080, host: 6080, id: "novnc_haos"
    config.vm.network "forwarded_port",   guest: 4357, host: 4357, id: "supervisor_api"
  end

  # ── VirtualBox ────────────────────────────────────────────────────────────────
  config.vm.provider "virtualbox" do |vb|
    vb.name   = "limen-os-#{VM_MODE}"
    vb.memory = VM_RAM
    vb.cpus   = VM_CPUS
    vb.customize ["modifyvm", :id, "--audio",           "none"]
    vb.customize ["modifyvm", :id, "--clipboard-mode",  "bidirectional"]

    if VM_MODE == "dev"
      vb.gui = true
      vb.customize ["modifyvm", :id, "--vram",              "128"]
      vb.customize ["modifyvm", :id, "--graphicscontroller", "vmsvga"]
      vb.customize ["modifyvm", :id, "--accelerate3d",       "on"]
    end

    if VM_MODE == "haos"
      vb.customize ["modifyvm", :id, "--nested-hw-virt", "on"]
    end
  end

  # ── libvirt ───────────────────────────────────────────────────────────────────
  # vagrant plugin install vagrant-libvirt
  config.vm.provider "libvirt" do |lv|
    lv.memory  = VM_RAM
    lv.cpus    = VM_CPUS
    lv.driver  = "kvm"
    lv.video_type    = "vga"
    lv.graphics_type = "vnc"
    lv.nested  = true if VM_MODE == "haos"
  end

  # ── Disk resize for RPM-based guests (Fedora / CentOS / Rocky) ───────────────
  # bento/ubuntu and bento/debian handle cloud-init resize automatically.
  # Keep this block here for when non-Debian boxes are tested.
  if %w[fedora centos rocky].any? { |n| VM_BOX.include?(n) }
    config.vm.provision "shell", name: "disk-resize", inline: <<~SHELL
      set -e
      ROOT_DEVICE=$(findmnt -n -o SOURCE /)
      DISK=$(lsblk -no PKNAME "$ROOT_DEVICE" | head -n1)
      PART="/dev/$DISK$(echo "$ROOT_DEVICE" | grep -o '[0-9]*$')"
      DISK="/dev/$DISK"
      dnf install -y cloud-utils-growpart util-linux || true
      DISK_SIZE=$(lsblk -bndo SIZE "$DISK")
      PART_SIZE=$(lsblk -bndo SIZE "$PART")
      SHOULD_RESIZE=$(awk -v d="$DISK_SIZE" -v p="$PART_SIZE" 'BEGIN { print (p < d) ? 1 : 0 }')
      if [ "$SHOULD_RESIZE" -eq 1 ]; then
        growpart "$DISK" "$(echo "$PART" | grep -o '[0-9]*$')" || true
        case "$(findmnt -n -o FSTYPE /)" in
          xfs)  xfs_growfs / || true ;;
          ext4) resize2fs "$PART" || true ;;
        esac
      fi
    SHELL
  end

  # ── Provisioning ──────────────────────────────────────────────────────────────
  if VM_MODE == "haos"
    config.vm.provision "shell",
      path: "scripts/haos-provision.sh",
      env:  { "LIMEN_ROOT" => "/opt/limen" }
  else
    config.vm.provision "shell",
      path: "scripts/vagrant-provision.sh",
      env:  {
        "LIMEN_VM_MODE"   => VM_MODE,
        "LIMEN_KIOSK_URL" => KIOSK_URL,
        "HA_HOST"         => HA_HOST,
      }
  end
end
