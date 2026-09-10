.DEFAULT_GOAL := help

.PHONY: help run

help:
	@printf '%s\n' \
		'可用指令：' \
		'  make run    啟動前後端開發伺服器' \
		'  make help   顯示此說明'

run:
	@cleanup() { kill "$$server_pid" "$$client_pid" 2>/dev/null || true; }; \
		trap cleanup INT TERM EXIT; \
		npm --prefix server run dev & \
		server_pid=$$!; \
		npm --prefix client run dev & \
		client_pid=$$!; \
		wait