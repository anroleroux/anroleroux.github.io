include make/tpl.mk

# Build targets — see .claude/skills/unframe (dev/stg/prd contract):
#
#   dev  offline. The //online block is stripped, so there is no backend and no
#        secrets are needed. Local preview only; never deployed.
#   stg  online, env 0. Deployed to staging.anroleroux.co.za. Exercises the real
#        backend wiring before promotion. Never indexed.
#   prd  online, env 1. Deployed to anroleroux.co.za. Indexed, with a sitemap.
#
# Supabase config is injected here rather than hard-coded in ui/root.js. The
# values are public (they ship in the built JS), but keeping them in CI config
# lets staging and production point at different projects without a code change.
SUPABASE_URL ?=
SUPABASE_PUBLISHABLE_KEY ?=

# Compose the shared stylesheet and script, then copy every page and asset into
# dist/. Always recomposed: dev rewrites ui/dist/index.js in place (stripping the
# online block), so a file-timestamp rule would let a later `make prd` ship the
# stripped copy.
define build_common
	@mkdir -p ui/dist
	$(call compose,ui/root.css,make/web.map,ui/dist/index.css)
	$(call compose,ui/root.js,make/web.map,ui/dist/index.js)
	$(call compose,ui/home.html,make/web.map,ui/dist/index.html)
	@cp ui/unlog.html ui/dist/unlog.html
	@cp ui/contact.html ui/dist/contact.html
	@cp ui/articles/* ui/dist/
	@cp ui/og.png ui/dist/og.png
	@cp ui/favicon.ico ui/favicon.svg ui/apple-touch-icon.png ui/dist/
endef

# Substitute the Supabase config into the built JS. Online builds only — `dev`
# strips the block that contains the placeholders. Fails loudly when unset:
# shipping the literal placeholder would break every backend call at runtime.
define inject_supabase
	@[ -n "$(SUPABASE_URL)" ] || { echo "SUPABASE_URL is not set (required for an online build)" >&2; exit 1; }
	@[ -n "$(SUPABASE_PUBLISHABLE_KEY)" ] || { echo "SUPABASE_PUBLISHABLE_KEY is not set (required for an online build)" >&2; exit 1; }
	@sed -i 's|__SUPABASE_URL__|$(SUPABASE_URL)|g' ui/dist/index.js
	@sed -i 's|__SUPABASE_PUBLISHABLE_KEY__|$(SUPABASE_PUBLISHABLE_KEY)|g' ui/dist/index.js
	@! grep -q '__SUPABASE_' ui/dist/index.js || { echo "unsubstituted Supabase placeholder left in ui/dist/index.js" >&2; exit 1; }
endef

# Staging must never be indexed. Inject a noindex tag into every built page
# (skipping any that already declare one) as a second layer behind the
# Disallow-all robots.txt. Every page also carries a canonical link to its
# production URL as a third.
define staging_noindex
	@cp ui/robots.staging.txt ui/dist/robots.txt
	@for f in ui/dist/*.html; do \
		grep -q 'name="robots"' "$$f" || \
		sed -i 's#\(<title>[^<]*</title>\)#\1\n  <meta name="robots" content="noindex, nofollow" />#' "$$f"; \
	done
endef

.PHONY: dev stg prd clean c

dev:
	$(build_common)
	@# Strip the online paths from every built artefact, not just index.js:
	@# the pages are copied verbatim, so an inline <script> carrying the markers
	@# would otherwise keep its backend calls in the offline build.
	@sed -i '/\/\/online-start$$/,/\/\/online-end$$/d' ui/dist/index.js ui/dist/*.html
	@sed -i '/\/\/online$$/d' ui/dist/index.js ui/dist/*.html
	$(staging_noindex)
	@echo "Built offline dev version → ui/dist/"

stg:
	$(build_common)
	$(inject_supabase)
	@sed -i 's/^let DB_ENV = 1;$$/let DB_ENV = 0;/' ui/dist/index.js
	@grep -q '^let DB_ENV = 0;$$' ui/dist/index.js || { echo "DB_ENV was not stamped to 0 — staging rows would be written as production" >&2; exit 1; }
	$(staging_noindex)
	@echo "staging.anroleroux.co.za" > ui/dist/CNAME
	@echo "Built online staging version (env 0) → ui/dist/"

prd:
	$(build_common)
	$(inject_supabase)
	@cp ui/robots.prod.txt ui/dist/robots.txt
	@sh make/gen-sitemap.sh
	@echo "anroleroux.co.za" > ui/dist/CNAME
	@echo "Built online production version (env 1) → ui/dist/"

clean c:
	rm -rf ui/dist
