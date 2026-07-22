include make/tpl.mk

# Three mode flags are used to determine a build. XXX means no flags are enabled.
#
# mode flags:
# - enable unit testing (T)
# - readable web content (R)
# - types of back-end (G|S)

.PHONY: dev TRX

dev TRX: ui/home.html ui/dist/index.css ui/dist/index.js
	@mkdir -p ui/dist
	@sed -i '/\/\/online-start$$/,/\/\/online-end$$/d' ui/dist/index.js
	@sed -i '/\/\/online$$/d' ui/dist/index.js
	$(call compose,ui/home.html,make/web.map,ui/dist/index.html)
	@cp ui/unlog.html ui/dist/unlog.html
	@cp ui/contact.html ui/dist/contact.html
	@cp ui/articles/* ui/dist/
	@echo "Built local dev version"

.PHONY: prd TRS

prd TRS: ui/home.html ui/dist/index.css ui/dist/index.js
	@mkdir -p ui/dist
	$(call compose,ui/home.html,make/web.map,ui/dist/index.html)
	@cp ui/unlog.html ui/dist/unlog.html
	@cp ui/contact.html ui/dist/contact.html
	@cp ui/articles/* ui/dist/
	@echo "anroleroux.co.za" > ui/dist/CNAME
	@echo "Built local dev version → dist/index.html"

ui/dist/index.css: ui/root.css ui/almanac.css ui/cosmos.css $(wildcard comps/*.css)
	@mkdir -p ui/dist
	$(call compose,ui/root.css,make/web.map,ui/dist/index.css)

ui/dist/index.js: ui/root.js $(wildcard comps/*.js)
	@mkdir -p ui/dist
	$(call compose,ui/root.js,make/web.map,ui/dist/index.js)

.PHONY: clean c

clean c:
	rm -rf ui/dist
