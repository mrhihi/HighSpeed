.DEFAULT_GOAL := help

.PHONY: help run install build clean

help:
	@printf '%s\n' \
		'可用指令：' \
		'  make build  安裝依賴並建置前端及後端 bundle' \
		'  make clean  清除編譯結果及過程檔' \
		'  make run    啟動前後端開發伺服器' \
		'  make help   顯示此說明'

install:
	npm --prefix client install
	npm --prefix server install

build: install
	npm --prefix client run build
	npm --prefix server run build

clean:
	rm -rf client/dist server/dist client/.vite client/node_modules/.vite client/node_modules/.tmp

run:
	@cleanup() { kill "$$server_pid" "$$client_pid" 2>/dev/null || true; }; \
		trap cleanup INT TERM EXIT; \
		npm --prefix server run dev & \
		server_pid=$$!; \
		npm --prefix client run dev & \
		client_pid=$$!; \
		wait
