include make/tpl.mk

# Three mode flags are used to determine a build. XXX means no flags are enabled.
#
# mode flags:
# - enable unit testing (T)
# - readable web content (R)
# - types of back-end (G|S)

.PHONY: dev TRX

dev TRX: index.html dist/index.css dist/index.js
	@mkdir -p dist
	@sed -i '/\/\/online-start$$/,/\/\/online-end$$/d' dist/index.js
	@sed -i '/\/\/online$$/d' dist/index.js
	$(call compose,index.html,make/web.map,dist/index.html)
	@echo "Built local dev version → dist/index.html"

dist/index.css: index.css almanac.css cosmos.css $(wildcard comps/*.css)
	@mkdir -p dist
	$(call compose,index.css,make/web.map,dist/index.css)

dist/index.js: index.js $(wildcard comps/*.js)
	@mkdir -p dist
	$(call compose,index.js,make/web.map,dist/index.js)

.PHONY: clean c

clean c:
	rm -rf dist
