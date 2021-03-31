format:
	@npx prettier index.html static/js/index.js static/js/load_test_data.js --write --tab-width 4

git_all:
	@git add -A .
	@git commit -m "$(m)"
	@git push origin

serve:
	@python3 -m http.server
