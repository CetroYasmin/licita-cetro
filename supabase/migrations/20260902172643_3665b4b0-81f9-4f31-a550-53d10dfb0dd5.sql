UPDATE public.portais SET ativo = true WHERE connector_type = 'comprasnet';
INSERT INTO public.portais (nome, slug, base_url, ativo, connector_type)
SELECT 'Compras.gov.br', 'comprasnet', 'https://cnetmobile.estaleiro.serpro.gov.br', true, 'comprasnet'
WHERE NOT EXISTS (SELECT 1 FROM public.portais WHERE connector_type = 'comprasnet');