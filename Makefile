include make/tpl.mk

# Three mode flags are used to determine a build. XXX means no flags are enabled.
#
# mode flags:
# - enable unit testing (T)
# - readable web content (R)
# - types of back-end (G|S)

.PHONY: dev TRX

dev TRX: home.html dist/index.css dist/index.js
	@mkdir -p dist
	@sed -i '/\/\/online-start$$/,/\/\/online-end$$/d' dist/index.js
	@sed -i '/\/\/online$$/d' dist/index.js
	$(call compose,home.html,make/web.map,dist/index.html)
	@cp ccm.html dist/ccm.html
	@cp pic.html dist/pic.html
	@cp bm1.html dist/bm1.html
	@cp bm2.html dist/bm2.html
	@cp egn.html dist/egn.html
	@cp esi.html dist/esi.html
	@cp unlog.html dist/unlog.html
	@cp contact.html dist/contact.html
	@cp pic-mod.js dist/pic-mod.js
	@cp dist/index.html index.html
	@cp dist/index.js index.js
	@cp dist/index.css index.css
	@echo "Built local dev version → dist/index.html"

.PHONY: prd TRS

prd TRS: home.html dist/index.css dist/index.js
	@mkdir -p dist
	$(call compose,home.html,make/web.map,dist/index.html)
	@cp ccm.html dist/ccm.html
	@cp pic.html dist/pic.html
	@cp bm1.html dist/bm1.html
	@cp bm2.html dist/bm2.html
	@cp egn.html dist/egn.html
	@cp esi.html dist/esi.html
	@cp unlog.html dist/unlog.html
	@cp contact.html dist/contact.html
	@cp pic-mod.js dist/pic-mod.js
	@echo "Built local dev version → dist/index.html"

dist/index.css: root.css almanac.css cosmos.css $(wildcard comps/*.css)
	@mkdir -p dist
	$(call compose,root.css,make/web.map,dist/index.css)

dist/index.js: root.js $(wildcard comps/*.js)
	@mkdir -p dist
	$(call compose,root.js,make/web.map,dist/index.js)

.PHONY: clean c

clean c:
	rm -rf dist
